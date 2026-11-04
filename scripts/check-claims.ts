// Curator self-check for data/batch/claims/<pair>.json before any verdict exists. No network, no model calls.
// Usage: npx tsx scripts/check-claims.ts <pair ...>   or   npx tsx scripts/check-claims.ts --slice=2
import { existsSync, readFileSync } from 'node:fs';
import { hasBannedWords } from '../server/agent/advice';
import { quoteMatches } from '../server/agent/verify';
import { packetSchema } from './batch-packets';
import { banned, claimsSchema, words } from './validate-batch';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const args = process.argv.slice(2);
const slice = args.find((a) => a.startsWith('--slice='))?.slice(8);
const pairs: string[] = slice ? (read(`data/batch/slices/slice-${slice}.json`) as { pair: string }[]).map((p) => p.pair) : args;

let ok = 0;
let missing = 0;
const problems: string[] = [];
for (const pair of pairs) {
  const file = `data/batch/claims/${pair}.json`;
  if (!existsSync(file)) {
    missing++;
    continue;
  }
  const errs: string[] = [];
  try {
    const d = claimsSchema.parse(read(file));
    const p = packetSchema.parse(read(`data/batch/packets/${pair}.json`));
    if (d.pair !== pair) errs.push('pair field mismatch');
    const ids = new Set(d.claims.map((c) => c.id));
    if (ids.size !== d.claims.length) errs.push('duplicate claim ids');
    for (const c of d.claims) {
      const src = p.sources.find((s) => s.ref.id === c.sourceId);
      if (!src) errs.push(`${c.id}: unknown sourceId ${c.sourceId}`);
      else if (!quoteMatches(c.quote, src.text)) errs.push(`${c.id}: quote not found verbatim in ${c.sourceId}`);
      if (src?.language && src.language !== 'en' && !c.quoteEnglish) errs.push(`${c.id}: quoteEnglish required`);
      if (banned.test(c.text) || hasBannedWords(c.text)) errs.push(`${c.id}: banned word in claim text`);
      if (words(c.text) > 40) errs.push(`${c.id}: claim text over 40 words`);
    }
    const sentences = [['headline', d.headline], ...d.reported.map((s, i) => [`reported.${i}`, s] as const), ...d.mechanism.map((s, i) => [`mechanism.${i}`, s] as const)] as const;
    for (const [path, s] of sentences) {
      if (banned.test(s.text) || hasBannedWords(s.text)) errs.push(`${path}: banned word`);
      if (words(s.text) > (path === 'headline' ? 25 : 40)) errs.push(`${path}: too long`);
      for (const id of s.claimIds) if (!ids.has(id)) errs.push(`${path}: cites unknown claim ${id}`);
    }
    if (d.claims.length && !d.headline.claimIds.length) errs.push('headline cites no claim');
    for (const g of d.gaps) if (banned.test(g.text) || hasBannedWords(g.text) || words(g.text) > 40) errs.push('gap prose');
  } catch (e) {
    errs.push(String(e).slice(0, 400));
  }
  if (errs.length) problems.push(`${pair}:\n  ${errs.join('\n  ')}`);
  else ok++;
}
console.log(`${ok} ok, ${problems.length} with problems, ${missing} not written yet (of ${pairs.length})`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exitCode = 1;
}
