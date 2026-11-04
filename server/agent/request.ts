import type { RunContext } from '../runContext';
import { z } from 'zod';
import type { CuratedEdge, SourceRef } from '../../shared/contract';
import { catalog } from '../generated/catalog';
import { substances, labelSetIds } from '../../data/substances';
import { fetchJson } from '../tools/http';
import { LABEL_SECTIONS, getLabelSectionsBySetId, type LabelSection } from '../tools/openfda';
import { rememberSource } from '../tools/sourceStore';
import { runEdge, type RunOptions } from './run';

export function resolveRequested(id: string) {
  const curated = substances.find(s => s.id === id);
  const entry = catalog.find(s => s.id === id);
  if (!curated && !entry) throw new Error('Unknown substance');
  return { id, name: curated?.name ?? entry!.name, rxcui: curated?.rxcui ?? entry?.rxcui,
    aliases: [...(curated?.aliases ?? []), ...(entry?.synonyms ?? []), ...(entry?.brands.map(b => b.name) ?? [])],
    pin: labelSetIds[id], alcohol: curated?.kind === 'alcohol' };
}
const labelSchema = z.object({ set_id: z.string(), effective_time: z.string().default(''),
  openfda: z.object({ generic_name: z.array(z.string()).default([]), substance_name: z.array(z.string()).default([]), product_type: z.array(z.string()).default([]) })
}).catchall(z.unknown());
const responseSchema = z.object({ results: z.array(labelSchema) });
type Label = z.infer<typeof labelSchema>;
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function rankLabels(labels: Label[], inn: string) {
  const matches = (name: string) => normalized(name) === normalized(inn) || normalized(name).startsWith(normalized(inn) + ' ');
  return labels.filter(label => {
    const f = label.openfda;
    return f.substance_name.length <= 1 && f.product_type.some(t => ['HUMAN PRESCRIPTION DRUG', 'HUMAN OTC DRUG'].includes(t)) &&
      ((f.generic_name.length === 1 && matches(f.generic_name[0]) && !/[,;/]| and /i.test(f.generic_name[0])) ||
       (f.substance_name.length === 1 && matches(f.substance_name[0]) && f.generic_name.length <= 1 && !/[,;/]| and /i.test(f.generic_name[0] ?? '')));
  }).sort((a, b) => Number(b.openfda.product_type.includes('HUMAN PRESCRIPTION DRUG')) - Number(a.openfda.product_type.includes('HUMAN PRESCRIPTION DRUG')) || b.effective_time.localeCompare(a.effective_time) || a.set_id.localeCompare(b.set_id));
}
export async function discoverLabel(inn: string, signal?: AbortSignal, context?: RunContext): Promise<LabelSection[]> {
  const url = new URL('https://api.fda.gov/drug/label.json');
  const term = inn.replace(/[^a-zA-Z0-9 -]/g, '');
  let label: Label | undefined;
  for (const productType of ['HUMAN PRESCRIPTION DRUG', 'HUMAN OTC DRUG']) {
    url.searchParams.set('search', `(openfda.generic_name:"${term}" OR openfda.substance_name:"${term}") AND openfda.product_type:"${productType}"`);
    url.searchParams.set('sort', 'effective_time:desc'); url.searchParams.set('limit', '10');
    try { label = rankLabels(responseSchema.parse(await fetchJson(url, signal, context)).results, inn)[0]; }
    catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof Error) || error.message !== 'Source HTTP 404') throw error;
    }
    if (label) break;
  }
  if (!label) return [];
  return LABEL_SECTIONS.flatMap(section => {
    const values = z.array(z.string()).optional().parse(label[section]);
    return values?.length ? [{ kind: 'fda_label' as const, id: `${label.set_id}#${section}`, setId: label.set_id, section, text: values.join('\n\n'), url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${label.set_id}` }] : [];
  });
}
const classesSchema = z.object({ rxclassDrugInfoList: z.object({ rxclassDrugInfo: z.array(z.object({ rela: z.string().optional(), rxclassMinConceptItem: z.object({ className: z.string(), classType: z.string() }) })).default([]) }).optional() });
export function classTerms(names: string[]) {
  const terms = new Set(names);
  const aliases: [RegExp, string[]][] = [
    [/non.?steroidal|NSAID/i, ['NSAIDs', 'nonsteroidal anti-inflammatory drugs']],
    [/serotonin reuptake|SSRI/i, ['SSRIs', 'serotonergic drugs']],
    [/opioid|opiate/i, ['opioids', 'CNS depressants']],
    [/hypnotic|sedative|benzodiazepine/i, ['CNS depressants']],
    [/anticoagulant/i, ['anticoagulants']],
    [/monoamine oxidase/i, ['MAO inhibitors', 'monoamine oxidase inhibitors']],
    [/QT prolong/i, ['QT-prolonging drugs']],
    [/angiotensin converting enzyme|angiotensin-converting enzyme/i, ['ACE inhibitors']],
  ];
  for (const [pattern, values] of aliases) if (names.some(n => pattern.test(n))) values.forEach(v => terms.add(v));
  return [...terms];
}
export async function getDrugClasses(rxcui: string | undefined, signal?: AbortSignal, context?: RunContext) {
  if (!rxcui) return [];
  const names: string[] = [];
  // EPC is a class type from DAILYMED, not a relaSource.
  for (const source of ['ATC', 'MEDRT', 'DAILYMED']) {
    const url = new URL('https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json');
    url.searchParams.set('rxcui', rxcui); url.searchParams.set('relaSource', source);
    try {
      const result = classesSchema.parse(await fetchJson(url, signal, context));
      for (const item of result.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
        if (source === 'DAILYMED' ? item.rxclassMinConceptItem.classType === 'EPC' : source === 'ATC' || /has_(MOA|PE|EPC)/i.test(item.rela ?? '')) names.push(item.rxclassMinConceptItem.className);
      }
    } catch { signal?.throwIfAborted(); }
  }
  return classTerms(names);
}
export function matchingPassages(sections: LabelSection[], names: string[]) {
  const terms = names.map(normalized).filter(n => n.length > 2);
  return sections.flatMap(section => {
    const sentences = section.text.match(/[^.!?\n]+(?:[.!?]+|$)/g) ?? [];
    const text = sentences.filter(s => terms.some(term => ` ${normalized(s)} `.includes(` ${term} `))).join('\n');
    return text ? [{ ref: { kind: section.kind, id: section.id }, text }] : [];
  });
}
export interface RequestedOptions extends Omit<RunOptions, 'prepare' | 'requested' | 'inject'> {
  labels?: (side: ReturnType<typeof resolveRequested>, signal?: AbortSignal, context?: RunContext) => Promise<LabelSection[]>;
  classes?: typeof getDrugClasses;
}
export async function runRequestedPair(aId: string, bId: string, options: RequestedOptions = {}) {
  if (aId === bId) throw new Error('Choose two different substances');
  const [a, b] = [aId, bId].sort().map(resolveRequested);
  const pair: CuratedEdge['pair'] = `${a.id}__${b.id}`;
  return runEdge(pair, { ...options, prepare: async (signal, emit, context) => {
    const labels: Record<string, SourceRef[]> = {};
    const searched: string[] = [];
    const sides: NonNullable<RunOptions['requested']>['substances'] = [];
    const sections: LabelSection[][] = [];
    for (const side of [a, b]) {
      let found: LabelSection[] = [];
      if (!side.alcohol) {
        try { found = await (options.labels ?? ((s, abort) => s.pin ? getLabelSectionsBySetId(s.pin, abort, context) : discoverLabel(s.name, abort, context)))(side, signal, context); }
        catch { signal?.throwIfAborted(); searched.push(`FDA label retrieval unavailable: ${side.name}`); }
        searched.push(`FDA label sections for ${side.name}: ${found.map(s => s.id).join(', ') || 'none retrieved'}`);
      }
      for (const section of found) rememberSource(section, section.text, context);
      labels[side.id] = found.map(({ kind, id }) => ({ kind, id }));
      sections.push(found);
      sides.push({ id: side.id, name: side.name, aliases: side.alcohol ? [...side.aliases, 'alcoholic beverages'] : side.aliases, classes: await (options.classes ?? getDrugClasses)(side.rxcui, signal, context) });
    }
    const passages = sections.flatMap((found, index) => {
      const other = sides[1 - index];
      return matchingPassages(found, [other.name, ...other.aliases, ...other.classes]);
    });
    emit({ type: 'thinking', text: `Read ${sections.flat().length} FDA label sections; found ${passages.length} matching passages.` });
    for (const passage of passages) emit({ type: 'tool_result', callId: `prescan:${passage.ref.id}`, summary: passage.text, sourceIds: [passage.ref.id] });
    return { edge: { pair, a: a.id, b: b.id, category: 'other', label: '', seedSources: sections.flat().map(({ kind, id }) => ({ kind, id })) }, requested: { substances: sides, passages, labels }, searched };
  } });
}
