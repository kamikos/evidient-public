import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { EvidenceRecord } from '../shared/contract';
import { claimContainsAdvice } from '../server/agent/advice';
import { wordCount, withinSentenceLimit } from '../server/agent/textQuality';
import { quoteMatches } from '../server/agent/verify';
import { wordOverlap } from '../server/agent/synthesize';
import { questions } from '../server/agent/questions';
import { getSourceText } from '../server/tools/sourceStore';
import { getLabelSectionsBySetId } from '../server/tools/openfda';
import type { LabelSection } from '../server/tools/openfda';

export const root = 'data/raw/batch-labels';
const extraSections = new Map<string, LabelSection>();
function registerOTC(body: string) {
  const parsed = z.object({ results: z.array(z.object({ set_id: z.string(), ask_doctor: z.array(z.string()).optional() })) }).safeParse(JSON.parse(body));
  if (!parsed.success) return;
  for (const label of parsed.data.results) if (label.ask_doctor?.length) extraSections.set(label.set_id, { kind: 'fda_label', id: `${label.set_id}#ask_doctor`, setId: label.set_id, section: 'ask_doctor', text: label.ask_doctor.join('\n\n'), url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${label.set_id}` });
}
export function withOTC(sections: LabelSection[]) {
  const extra = sections[0] && extraSections.get(sections[0].setId);
  return extra ? [...sections, extra] : sections;
}
export function material(id: string) {
  return z.object({ sections: z.array(z.object({ kind: z.literal('fda_label'), id: z.string(), setId: z.string(), section: z.string(), text: z.string(), url: z.string() })), classes: z.array(z.string()) }).parse(JSON.parse(readFileSync(`${root}/substances/${id}.json`, 'utf8')));
}
export const pairSchema = z.object({ pair: z.templateLiteral([z.string(), '__', z.string()]), a: z.string(), b: z.string(), popularity: z.number(), reasons: z.array(z.object({ owner: z.string(), section: z.string(), target: z.string(), term: z.string(), kind: z.enum(['alcohol', 'name', 'class']) })), priority: z.number() });
export type BatchPair = z.infer<typeof pairSchema>;
export function save(path: string, value: unknown) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value) + '\n'); renameSync(`${path}.tmp`, path);
}
export function readPairs() { return z.array(pairSchema).parse(JSON.parse(readFileSync('data/batch/pairs.json', 'utf8'))); }
export function spent() {
  const file = process.env.SPEND_LEDGER_FILE ?? 'artifacts/M10-spend.jsonl';
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).reduce((sum, line) => sum + z.object({ usd: z.number() }).parse(JSON.parse(line)).usd, 0) : 0;
}
const scope = new AsyncLocalStorage<{ reserve: number; historyBound: number }>();
const active = new Set<{ reserve: number; historyBound: number }>();
export async function budgeted<T>(work: () => Promise<T>) {
  const account = { reserve: 0, historyBound: 0 }; active.add(account);
  try { return await scope.run(account, work); } finally { active.delete(account); }
}
export function installTransport() {
  mkdirSync(root, { recursive: true });
  const original = globalThis.fetch;
  let queue = Promise.resolve();
  let last = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://api.meta.ai/')) throw new Error('Model calls forbidden for batch data building');
    if (!/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|eutils\.ncbi\.nlm\.nih\.gov)\//.test(url)) return original(input, init);
    const key = createHash('sha256').update(url).digest('hex');
    const file = `${root}/${key}.json.gz`;
    if (existsSync(file)) {
      const item = z.object({ status: z.number(), body: z.string(), contentType: z.string() }).parse(JSON.parse(gunzipSync(readFileSync(file)).toString()));
      if (url.startsWith('https://api.fda.gov/') && item.status === 200) registerOTC(item.body);
      return new Response(item.body, { status: item.status, headers: { 'content-type': item.contentType } });
    }
    const slot = queue.then(async () => {
      await new Promise(r => setTimeout(r, Math.max(0, 400 - (Date.now() - last))));
      last = Date.now();
    });
    queue = slot;
    await slot;
    const response = await original(input, init);
    const body = await response.text();
    if (url.startsWith('https://api.fda.gov/') && response.ok) registerOTC(body);
    if (response.ok || response.status === 404) {
      const bytes = gzipSync(JSON.stringify({ url, retrievedAt: new Date().toISOString(), status: response.status, body, contentType: response.headers.get('content-type') ?? '', sha256: createHash('sha256').update(body).digest('hex') }));
      writeFileSync(file, bytes);
    }
    return new Response(body, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? '' } });
  };
}
export function judgeUnavailable(record: EvidenceRecord) {
  return record.card.claims.some(c => c.judgeRationale === 'Judge unavailable') || record.trace.some(e => e.type === 'thinking' && /judge.*(?:unavailable|failed)|sentence.*unavailable/i.test(e.text));
}
export async function audit(record: EvidenceRecord) {
  const card = record.card;
  const accepted = card.claims.filter(c => c.accepted);
  const ids = new Set(accepted.map(c => c.id));
  const sentences = [card.headline, ...card.reported, ...card.mechanism, ...card.conflicts.map(c => c.summary)];
  const problems: string[] = [];
  if (card.origin !== 'requested') problems.push('origin');
  if (!accepted.length) return problems;
  if (!card.reported.length) problems.push('empty reported');
  if (wordCount(card.headline.text) > 25 || sentences.some(s => !withinSentenceLimit(s.text))) problems.push('length');
  if (sentences.some(s => claimContainsAdvice(s.text)) || accepted.some(c => claimContainsAdvice(c.text))) problems.push('advice');
  if (sentences.some(s => !s.claimIds.length || s.claimIds.some(id => !ids.has(id)))) problems.push('citations');
  if (sentences.some(s => /\[c\d+/i.test(s.text))) problems.push('inline citations');
  if (card.reported.length > 3) problems.push('too many reports');
  if (card.reported.some((s, i) => card.reported.slice(i + 1).some(other => wordOverlap(s.text, other.text) > .7))) problems.push('duplicate reports');
  if (card.gaps.length > 1 || card.gaps.some(g => wordCount(g.text) > 25 || /Within the retrieved results/i.test(g.text))) problems.push('gap quality');
  if (card.sources.some(s => !card.claims.some(c => c.source.kind === s.kind && c.source.id === s.id) || /Unknown author/i.test(s.citation))) problems.push('source metadata');
  if (JSON.stringify(card.pharmacistQuestions) !== JSON.stringify(questions(card))) problems.push('questions');
  if (card.conflicts.some(c => !c.sideA.some(id => card.headline.claimIds.includes(id)) || !c.sideB.some(id => card.headline.claimIds.includes(id)))) problems.push('one-sided conflict');
  for (const claim of accepted) {
    if (claim.quoteCheck !== 'matched' || claim.support !== 'supports' || claim.injected) problems.push(`verification:${claim.id}`);
    try {
      const text = claim.source.kind === 'fda_label'
        ? withOTC(await getLabelSectionsBySetId(claim.source.id.split('#')[0])).find(s => s.id === claim.source.id)?.text ?? ''
        : await getSourceText(claim.source);
      if (!quoteMatches(claim.quote, text)) problems.push(`quote:${claim.id}`);
    } catch { problems.push(`source:${claim.id}`); }
  }
  return problems;
}
