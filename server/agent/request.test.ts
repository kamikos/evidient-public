import { afterEach, expect, it, vi } from 'vitest';
import { resolveRequested, rankLabels, matchingPassages, classTerms, runRequestedPair } from './request';
import type { Respond } from './runtime';
import type { LabelSection } from '../tools/openfda';
import type { TraceEvent } from '../../shared/contract';
import { getSourceText } from '../tools/sourceStore';
const section: LabelSection = { kind: 'fda_label', id: 'fake#drug_interactions', setId: 'fake', section: 'drug_interactions', text: 'An unrelated statement. ACE inhibitors may have reduced effect with NSAIDs. Another statement.', url: '' };
afterEach(() => vi.unstubAllEnvs());
it('resolves catalogue and curated substances with pinned labels and alcohol without a label', () => {
  expect(resolveRequested('levothyroxine')).toMatchObject({ id: 'levothyroxine', name: 'Levothyroxine' });
  expect(resolveRequested('ibuprofen').pin).toBeTruthy();
  expect(resolveRequested('alcohol')).toMatchObject({ alcohol: true, pin: undefined });
  expect(() => resolveRequested('../unknown')).toThrow();
});
it('ranks matching single-ingredient human Rx before newer OTC and excludes combinations and veterinary labels', () => {
  const label = (set_id: string, generic_name: string[], product_type: string[], effective_time: string) => ({ set_id, effective_time, openfda: { generic_name, substance_name: [], product_type } });
  const result = rankLabels([
    label('otc', ['ibuprofen'], ['HUMAN OTC DRUG'], '20260101'),
    label('old', ['ibuprofen'], ['HUMAN PRESCRIPTION DRUG'], '20200101'),
    label('new', ['ibuprofen sodium'], ['HUMAN PRESCRIPTION DRUG'], '20250101'),
    label('combo', ['ibuprofen and acetaminophen'], ['HUMAN PRESCRIPTION DRUG'], '20260101'),
    label('vet', ['ibuprofen'], ['PRESCRIPTION ANIMAL DRUG'], '20260101'),
    label('wrong', ['aspirin'], ['HUMAN PRESCRIPTION DRUG'], '20260101'),
  ], 'Ibuprofen');
  expect(result.map(l => l.set_id)).toEqual(['new', 'old', 'otc']);
});
it('matches classes and synonyms with word boundaries, retaining source identities', () => {
  expect(matchingPassages([section], classTerms(['Angiotensin-converting enzyme inhibitors']))).toEqual([{ ref: { kind: 'fda_label', id: section.id }, text: ' ACE inhibitors may have reduced effect with NSAIDs.' }]);
  expect(matchingPassages([{ ...section, text: 'Antiethanolamine is unrelated.' }], ['ethanol'])).toEqual([]);
  expect(classTerms(['Selective Serotonin Reuptake Inhibitors'])).toContain('SSRIs');
});
it('emits a zero-accepted card, keeps rejected claims, registers exact label text and skips synthesis', async () => {
  let turn = 0;
  const events: TraceEvent[] = [];
  const response: Respond = async (params, signal, context) => {
    if (turn++ === 0) {
      expect(JSON.stringify(params.input)).toContain('ACE inhibitors');
      expect(await getSourceText(section, signal, context)).toBe(section.text);
      return { id: 'r', output_text: '', output: [{ type: 'function_call', call_id: 'c', name: 'record_claim', arguments: JSON.stringify({ text: 'A fabricated finding.', quote: 'Invented quote.', sourceId: section.id, sourceKind: 'fda_label', stance: 'increases_risk', outcome: 'effect' }) }] };
    }
    return { id: 'r', output_text: '', output: [] };
  };
  const structured = vi.fn(async () => { throw new Error('Must not synthesize'); });
  const record = await runRequestedPair('lisinopril', 'ibuprofen', { labels: async () => [section], classes: async () => ['ACE inhibitors'], response, search: async () => [], fetch: async () => [], structured, onEvent: e => events.push(e) });
  expect(record.card).toMatchObject({ pair: 'ibuprofen__lisinopril', origin: 'requested', category: 'other', depth: 'limited', reported: [], mechanism: [], signal: { level: 'studies_only', basis: [], conflict: false } });
  expect(record.card.claims).toHaveLength(1);
  expect(record.card.claims[0]).toMatchObject({ accepted: false, quoteCheck: 'not_found' });
  expect(record.card.headline.claimIds).toEqual([]);
  expect(record.card.headline.text).toBe('The agent found no interaction between Ibuprofen and Lisinopril in the FDA labels and PubMed abstracts it checked.');
  expect(record.card.gaps[0].searched.join(' ')).toContain('FDA');
  expect(structured).not.toHaveBeenCalled();
  expect(events[0].type).toBe('run_started');
  expect(events.at(-1)?.type).toBe('card_ready');
});

it('verifies accepted requested claims through the independent judges and validates the category', async () => {
  const { fakeJudgments } = await import('./judgeFake');
  const quote = 'ACE inhibitors may have reduced effect with NSAIDs.';
  let turn = 0;
  const response: Respond = async () => ({ id: 'accepted', output_text: '', output: turn++ ? [] : [{ type: 'function_call', call_id: 'c', name: 'record_claim', arguments: JSON.stringify({ text: 'The label reports reduced ACE inhibitor effects with NSAIDs.', quote, sourceId: section.id, sourceKind: 'fda_label', stance: 'increases_risk', outcome: 'reduced_effect' }) }] });
  let judgeCalls = 0;
  const judge = async <T>(prompt: string, schema: import('zod').z.ZodType<T>) => { judgeCalls++; return fakeJudgments(prompt, schema, () => ({ support: 'supports', rationale: 'The quote supports the attributed class statement.' })); };
  const structured: import('./runtime').Structured = async (_prompt, schema, name) => schema.parse(name === 'category' ? { category: 'efficacy', justification: 'The accepted label claim reports a reduced effect.' } : { headline: { text: 'The label reports reduced ACE inhibitor effects with NSAIDs.', claimIds: ['c1'] }, reported: [{ text: 'The label reports reduced ACE inhibitor effects with NSAIDs.', claimIds: ['c1'] }], mechanism: [], conflicts: [] });
  const card = (await runRequestedPair('ibuprofen', 'lisinopril', { labels: async () => [section], classes: async () => ['ACE inhibitors'], response, search: async () => [], fetch: async () => [], structured, judge })).card;
  expect(card).toMatchObject({ origin: 'requested', category: 'efficacy', depth: 'label_only', signal: { level: 'label_mentions', basis: ['c1'] } });
  expect(card.claims[0]).toMatchObject({ accepted: true, quoteCheck: 'matched', support: 'supports' });
  expect(judgeCalls).toBeGreaterThanOrEqual(2);
});

it('makes a judge outage visible in a zero-accepted card without accepting unchecked claims', async () => {
  let turn = 0;
  const response: Respond = async () => ({ id: 'outage', output_text: '', output: turn++ ? [] : [{ type: 'function_call', call_id: 'c', name: 'record_claim', arguments: JSON.stringify({ text: 'The label reports reduced ACE inhibitor effects with NSAIDs.', quote: 'ACE inhibitors may have reduced effect with NSAIDs.', sourceId: section.id, sourceKind: 'fda_label', stance: 'increases_risk', outcome: 'effect' }) }] });
  const card = (await runRequestedPair('ibuprofen', 'lisinopril', { labels: async () => [section], classes: async () => [], response, search: async () => [], fetch: async () => [], judge: async () => { throw new Error('Provider unavailable'); } })).card;
  expect(card.claims[0]).toMatchObject({ quoteCheck: 'matched', accepted: false, judgeRationale: 'Judge unavailable' });
  expect(card.gaps[0].text).toContain('independent judge was unavailable');
  expect(card.signal?.basis).toEqual([]);
});
