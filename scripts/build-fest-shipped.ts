// Builds public/fest/<catalogue id>.json from data/sources/fest/interactions.json (DMP FEST, NLOD).
// Deterministic; no model calls. English renderings come from data/sources/fest/translate/en-*.json when present.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FestDrugFile, FestRecord, PairKey } from '../shared/contract';

interface Raw {
  id: string;
  hentetDato: string;
  recordTimestamp: string;
  substances: { name: string | null; substances: { name: string }[] }[];
  pairs: string[];
  relevance: { code: string; label: string };
  clinicalConsequence: string;
  mechanism: string;
  situationalCriterion: string | null;
  sourceBasis: { code: string; label: string };
  references: { text: string; url?: string }[];
}

const root = process.cwd();
const raw = JSON.parse(readFileSync(path.join(root, 'data/sources/fest/interactions.json'), 'utf8')) as Raw[];
const key = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const NORWEGIAN = /[æøå]|\b(?:og|eller|hos|ved|gjerne|ikke|økt|nedsatt|samtidig|mulig|muligens|trolig|kan gi|blant annet|enkelte|pasienter|ganger|bør|dette|disse|både|være|vist)\b/i;
export const looksNorwegian = (s: string) => NORWEGIAN.test(s);
let rejected = 0;
const english = new Map<string, string>();
const tdir = path.join(root, 'data/sources/fest/translate');
if (existsSync(tdir)) {
  for (const name of readdirSync(tdir).sort()) {
    if (!/^en-\d+\.json$/.test(name)) continue;
    for (const row of JSON.parse(readFileSync(path.join(tdir, name), 'utf8')) as { key: string; en: string }[]) {
      const text = row.en?.trim();
      // A rendering that still contains Norwegian is a failed translation: ship the original instead.
      if (text && !looksNorwegian(text)) english.set(row.key, text.charAt(0).toUpperCase() + text.slice(1));
      else if (text) rejected++;
    }
  }
}
const en = (s: string | null | undefined) => (s ? english.get(key(s)) : undefined);

const sideName = (g: Raw['substances'][number]) => {
  if (g.name) return g.name;
  const names = g.substances.map((s) => s.name);
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
};

const byDrug = new Map<string, Map<string, FestRecord[]>>();
let retrieved = '';
let translated = 0;
let records = 0;
for (const r of raw) {
  if (!r.pairs?.length) continue;
  if (!['1', '2', '3'].includes(r.relevance.code)) continue;
  retrieved ||= r.hentetDato;
  records++;
  const rec: FestRecord = {
    id: r.id,
    relevance: r.relevance.code as FestRecord['relevance'],
    relevanceLabel: r.relevance.label,
    consequence: r.clinicalConsequence,
    consequenceEnglish: en(r.clinicalConsequence),
    mechanism: r.mechanism,
    mechanismEnglish: en(r.mechanism),
    situation: r.situationalCriterion ?? undefined,
    situationEnglish: en(r.situationalCriterion),
    basis: r.sourceBasis.label,
    basisEnglish: en(r.sourceBasis.label),
    sides: [sideName(r.substances[0]), sideName(r.substances[1])],
    references: r.references.map((x) => ({ text: x.text, url: x.url })),
    updated: r.recordTimestamp,
  };
  if (rec.consequenceEnglish) translated++;
  for (const pair of r.pairs) {
    const [a, b] = pair.split('__');
    for (const [self, other] of [[a, b], [b, a]]) {
      const m = byDrug.get(self) ?? new Map<string, FestRecord[]>();
      byDrug.set(self, m);
      const list = m.get(other) ?? [];
      if (!list.some((x) => x.id === rec.id)) list.push(rec);
      m.set(other, list);
    }
  }
}

const out = path.join(root, 'public/fest');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let bytes = 0;
const index: Record<string, number> = {};
for (const [id, m] of [...byDrug].sort(([x], [y]) => x.localeCompare(y))) {
  const rows = [...m]
    .map(([other, recs]) => ({
      other,
      pair: (id < other ? `${id}__${other}` : `${other}__${id}`) as PairKey,
      records: recs.sort((x, y) => x.relevance.localeCompare(y.relevance) || x.id.localeCompare(y.id)),
    }))
    .sort((x, y) => x.records[0].relevance.localeCompare(y.records[0].relevance) || x.other.localeCompare(y.other));
  const file: FestDrugFile = { id, retrieved, rows };
  const json = JSON.stringify(file);
  bytes += json.length;
  index[id] = rows.length;
  writeFileSync(path.join(out, `${id}.json`), json);
}
writeFileSync(path.join(out, 'index.json'), JSON.stringify({ retrieved, counts: index }));
console.info(`FEST: ${records} records, ${byDrug.size} substances, ${translated} with English consequence, ${rejected} renderings rejected as still Norwegian, ${(bytes / 1e6).toFixed(1)} MB in public/fest`);
