import { existsSync } from "node:fs";
import { edges } from "../data/edges";
import {
  catalog,
  label,
  save,
  sentences,
  mentions,
  norm,
  main,
  type Pair,
} from "./batch-io";
export function drinkingAlcohol(s: string) {
  if (
    /(?:products? with (?:high )?concentrations of alcohol|contains? (?:ethanol|alcohol)|alcohol[- ]based|alcohol swab)/i.test(
      s,
    ) &&
    !/drink|consum|ingest|beverage/i.test(s)
  )
    return false;
  const cleaned = s.replace(
    /\b(?:benzyl|cetostearyl|cetyl|stearyl|isopropyl|polyvinyl|denatured)\s+alcohol\b|alcohol[- ]based\s+gel|alcohol\s+swabs?/gi,
    "",
  );
  return /(?:co-administered.{0,100}\b(?:ethanol|alcohol)\b|alcohol(?:ic)?\s+(?:consum|beverage|drink|intake|use|abuse)|(?:drink\w*|consum\w*|ingest\w*|intake\s+of)\s+(?:\w+\s+){0,2}(?:alcohol|ethanol)|(?:with|and|of|by)\s+(?:alcohol|ethanol)\b.{0,100}(?:effect|impair|sedat|drows|CNS|liver|bleed|hypoglyc|disulfiram|depress|potentiat|increas|decreas|risk)|(?:effect|impair|sedat|drows|CNS|liver|bleed|hypoglyc|disulfiram|depress|potentiat|increas|decreas|risk).{0,100}\b(?:alcohol|ethanol)\b|avoid\s+(?:the\s+)?(?:use\s+of\s+)?alcohol|ethanol\s+(?:intake|consum))/i.test(
    cleaned,
  );
}
export function validReason(r: Pair["reasons"][number], text: string) {
  if (
    r.kind === "name" &&
    /^(medicated|solution|cream|tablets|capsules|injection|alcohol|water)$/i.test(
      r.term,
    )
  )
    return false;
  if (
    r.target === "glucose" &&
    !/administ.{0,30}glucose|glucose.{0,30}(?:administ|oral|tablet)/i.test(text)
  )
    return false;
  if (r.target === "nicotine" && /nicotine adenine/i.test(text)) return false;
  if (r.kind === "alcohol") {
    if (
      /contains? (?:ethanol|alcohol)/i.test(text) &&
      !/drink|consum|ingest|beverage/i.test(text)
    )
      return false;
    return sentences(text).some(drinkingAlcohol);
  }
  if (
    r.kind === "class" &&
    /^(?:enzyme inhibitors|enzyme inducers|substrates|inhibitors|antagonists|agonists|anti inflammatory agents|analgesics|central nervous system agents)$/i.test(
      r.term,
    )
  )
    return false;
  return sentences(text).some(
    (s) =>
      mentions(s, [r.term]) &&
      /concomitant|concurrent|coadmin|interact|combin|co-admin|together|with|avoid|inhibit|potentiat|increas|decreas/i.test(
        s,
      ),
  );
}
export function filterCandidates(_input: Pair[] = []) {
  const entries = catalog().filter(c => c.kind !== "supplement" && c.id !== "alcohol");
  const rank = new Map(entries.map((c, i) => [c.id, i]));
  const candidates = new Map<string, Pair>();
  const materials = new Map(entries.map(e => [e.id, label(e.id)]));
  const excluded = new Set(edges.map(e => e.pair));
  const sectionsOf = (id: string) => (materials.get(id)?.sections ?? []).filter(s => /^(boxed_warning|contraindications|warnings|warnings_and_cautions|precautions|drug_interactions|when_using|do_not_use|ask_doctor|ask_doctor_or_pharmacist|stop_use)$/.test(s.section));
  const sectionCache = new Map(entries.map(e => [e.id, sectionsOf(e.id).map(s => ({ ...s, normalized: ` ${norm(s.text)} ` }))]));
  function add(owner: string, target: string, reasons: Pair["reasons"]) {
    const [a, b] = [owner, target].sort();
    const pair = `${a}__${b}` satisfies Pair["pair"];
    if (!reasons.length || excluded.has(pair) || existsSync(`data/batch/evidence/${pair}.json`)) return;
    const old = candidates.get(pair);
    reasons = [...(old?.reasons ?? []), ...reasons];
    candidates.set(pair, { pair, a, b, reasons,
      priority: Math.min(...reasons.map(r => /boxed_warning|contraindications/.test(r.section) ? 0 : 1)),
      popularity: Math.min(rank.get(a) ?? 9999, rank.get(b) ?? 9999),
    });
  }
  for (const owner of entries) {
    add(owner.id, 'alcohol', sectionsOf(owner.id).filter(s => sentences(s.text).some(drinkingAlcohol)).map(s => ({ owner: owner.id, target: 'alcohol', section: s.section, term: 'alcohol', kind: 'alcohol' })));
  }
  const top = entries.slice(0, 300);
  for (const owner of top) for (const target of top) {
    if (owner.id === target.id) continue;
    const terms = [target.name, ...target.synonyms, ...target.brands.map(b => b.name)].map(term => ({ term, kind: 'name' as const }));
    const allTerms = [...terms, ...(materials.get(target.id)?.classes ?? []).map(term => ({ term, kind: 'class' as const }))];
    const reasons: Pair['reasons'] = [];
    for (const s of sectionCache.get(owner.id) ?? []) {
      const match = allTerms.find(t => norm(t.term).length > 2 && s.normalized.includes(` ${norm(t.term)} `) && validReason({ owner: owner.id, target: target.id, section: s.section, ...t }, s.text));
      if (match) reasons.push({ owner: owner.id, target: target.id, section: s.section, ...match });
    }
    add(owner.id, target.id, reasons);
  }
  const order = (a: Pair, b: Pair) => a.priority - b.priority || a.popularity - b.popularity || Math.max(rank.get(a.a) ?? -1, rank.get(a.b) ?? -1) - Math.max(rank.get(b.a) ?? -1, rank.get(b.b) ?? -1) || a.pair.localeCompare(b.pair);
  const alcohol = [...candidates.values()].filter(p => p.a === 'alcohol' || p.b === 'alcohol').sort(order);
  const drugs = [...candidates.values()].filter(p => p.a !== 'alcohol' && p.b !== 'alcohol').sort(order);
  const selected = [...alcohol, ...drugs.slice(0, Math.max(0, 250 - alcohol.length))];
  return { selected, report: { selected: selected.length, tier1: alcohol.length, tier2: selected.length - alcohol.length, alcoholPairs: alcohol.map(p => p.pair), eligible: candidates.size, catalogOrder: 'Catalogue input order is the popularity proxy.' } };
}
if (main("batch-filter.ts")) {
  const r = filterCandidates();
  save("data/batch/pairs-final.json", r.selected);
  save("artifacts/M10b-filter.json", r.report);
}
