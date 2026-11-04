import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { substances } from '../data/substances';
import { edges } from '../data/edges';
import { discoverLabel, getDrugClasses } from '../server/agent/request';
import { mapConcurrent } from '../server/agent/runtime';
import { installTransport, save, withOTC, type BatchPair } from './batch-common';

const entrySchema = z.object({ id: z.string(), name: z.string(), kind: z.string().optional(), synonyms: z.array(z.string()), brands: z.array(z.object({ name: z.string() })), rxcui: z.string().optional() });
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function main() {
  installTransport();
  const catalog = z.array(entrySchema).parse(JSON.parse(readFileSync('data/catalog.json', 'utf8')));
  const chosen = new Map(catalog.filter(e => e.kind !== 'supplement').slice(0, 150).map(e => [e.id, e]));
  // Required pregabalin coverage even when the checked-in catalogue is alphabetically ordered.
  const pregabalin = catalog.find(e => e.id === 'pregabalin');
  if (pregabalin) chosen.set(pregabalin.id, pregabalin);
  for (const s of substances) chosen.set(s.id, catalog.find(e => e.id === s.id) ?? { ...s, synonyms: s.aliases, brands: (s.brands ?? []).map(name => ({ name })) });
  const failures: { id: string; stage: string }[] = [];
  const entries = [...chosen.values()];
  const materials = await mapConcurrent(entries, 3, async (entry) => {
    let sections: Awaited<ReturnType<typeof discoverLabel>> = [];
    if (entry.id !== 'alcohol') {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { sections = withOTC(await discoverLabel(entry.name)); break; } catch { if (attempt) failures.push({ id: entry.id, stage: 'label' }); }
      }
    }
    const classes = await getDrugClasses(entry.rxcui);
    save(`data/raw/batch-labels/substances/${entry.id}.json`, { sections, classes });
    process.stdout.write(`selected ${entry.id}: ${sections.length} sections\n`);
    return { entry, sections, classes };
  });
  const excluded = new Set(edges.map(e => e.pair));
  const pairs = new Map<string, BatchPair>();
  for (const [i, owner] of materials.entries()) for (const [j, target] of materials.entries()) {
    if (i === j) continue;
    const [a, b] = [owner.entry.id, target.entry.id].sort();
    const pair = `${a}__${b}` satisfies BatchPair['pair'];
    if (excluded.has(pair)) continue;
    const terms = target.entry.id === 'alcohol' ? [{ term: 'alcohol', kind: 'alcohol' as const }, { term: 'ethanol', kind: 'alcohol' as const }, { term: 'alcoholic beverages', kind: 'alcohol' as const }] : [
      ...[target.entry.name, ...target.entry.synonyms, ...target.entry.brands.map(b => b.name)].map(term => ({ term, kind: 'name' as const })),
      ...target.classes.map(term => ({ term, kind: 'class' as const })),
    ];
    for (const section of owner.sections.filter(s => /^(boxed_warning|contraindications|warnings|warnings_and_cautions|precautions|drug_interactions|when_using|do_not_use|ask_doctor|ask_doctor_or_pharmacist)$/.test(s.section))) {
      const text = ` ${normalize(section.text)} `;
      const match = terms.find(({ term }) => normalize(term).length > 2 && text.includes(` ${normalize(term)} `));
      if (!match) continue;
      const priority = match.kind === 'alcohol' ? 0 : /boxed_warning|contraindications/.test(section.section) ? 1 : 2;
      const row = pairs.get(pair) ?? { pair, a, b, popularity: Math.min(i, j) * entries.length + Math.max(i, j), priority, reasons: [] };
      row.priority = Math.min(row.priority, priority);
      row.reasons.push({ owner: owner.entry.id, target: target.entry.id, section: section.section, ...match }); pairs.set(pair, row);
    }
  }
  const ranked = [...pairs.values()].sort((a, b) => a.priority - b.priority || a.popularity - b.popularity || a.pair.localeCompare(b.pair));
  const selected = ranked.slice(0, 300);
  const pregabalinMentionRank = (p: BatchPair) => p.reasons.some(r => r.owner === 'pregabalin' && (r.kind === 'name' || r.kind === 'alcohol')) ? 0 : 1;
  const required = ranked.filter(p => p.reasons.some(r => r.owner === 'pregabalin')).sort((a, b) => pregabalinMentionRank(a) - pregabalinMentionRank(b) || a.priority - b.priority || a.popularity - b.popularity).slice(0, 8);
  for (const row of required) if (!selected.includes(row)) selected.push(row);
  selected.sort((a, b) => a.priority - b.priority || Number(required.includes(b)) - Number(required.includes(a)) || a.popularity - b.popularity || a.pair.localeCompare(b.pair));
  save('data/batch/pairs.json', selected);
  save('artifacts/M10-selection.json', { selectedSubstances: entries.length, reviewed: substances.length, labels: materials.filter(m => m.sections.length).length, qualifying: ranked.length, candidates: selected.length, reasons: Object.fromEntries(['alcohol', 'name', 'class'].map(kind => [kind, selected.filter(p => p.reasons.some(r => r.kind === kind)).length])), failures, catalogOrder: 'Preserved input order; input appears alphabetical. Pregabalin added explicitly as required.' });
}
void main();
