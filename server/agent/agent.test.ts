import { fakeJudgments } from './judgeFake';
import { describe, expect, it, vi } from 'vitest';
import type { Claim, Source, TraceEvent } from '../../shared/contract';
import { quoteMatches, normalizeQuote, verifyClaims, type ProposedClaim } from './verify';
import { deriveDepth, deriveConflicts, publicationDesign } from './derive';
import { filterSentence, hasBannedWords, synthesize } from './synthesize';
import { plantedClaims } from './inject';
import { runEdge } from './run';
import { research } from './research';
import { edges } from '../../data/edges';
import { mapReadText, identify } from '../identify';
import { questions } from './questions';
import type { Respond, Structured } from './runtime';

const label = { kind: 'fda_label' as const, id: edges[2].seedSources[0].id };
const pubmed = { kind: 'pubmed' as const, id: '12022894' };
const text = 'A reaction was reported. Twelve healthy men participated. No reaction was observed in this trial.';
const proposed: ProposedClaim = { id: 'c1', text: 'The label reports a reaction.', quote: 'A reaction was reported.', source: label, stance: 'increases_risk', outcome: 'reaction' };
const accepted: Claim = { ...proposed, quoteCheck: 'matched', support: 'supports', accepted: true };
function response(output: Awaited<ReturnType<Respond>>['output'] = [], output_text = ''): Awaited<ReturnType<Respond>> { return { id: 'r1', output, output_text }; }
function call(name: string, args: object, id = name): Awaited<ReturnType<Respond>>['output'][number] {
  return { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) };
}
const fakeStructured: Structured = async (prompt, schema, name) => schema.parse(name === 'study_metadata' ? {
  sampleSize: { value: 12, quote: 'Twelve healthy men participated.' }, population: { value: 'healthy men', quote: 'fabricated population quote' }, limitations: [],
} : { headline: { text: 'The label and trial differ.', claimIds: ['c1', 'c2'] },
  reported: [{ text: 'The label reports a reaction.', claimIds: ['c1'] }, { text: 'Invented sentence.', claimIds: ['absent'] }], mechanism: [], conflicts: [] });
const fakeJudge = async <T>(prompt: string, schema: import('zod').z.ZodType<T>) => fakeJudgments(prompt, schema, itemPrompt => ({ support: itemPrompt.includes('conclusively proves') ? 'overstated' : 'supports', rationale: 'The statement matches the source scope.' }));
function fakeResearch() {
  let turn = 0;
  const responseClient: Respond = async () => ++turn === 1 ? response([
    call('record_claim', { text: proposed.text, quote: proposed.quote, sourceId: label.id, sourceKind: 'fda_label', stance: 'increases_risk', outcome: 'reaction' }),
    call('search_pubmed', { query: 'metronidazole alcohol humans' }),
    call('record_claim', { text: 'No reaction was observed in twelve healthy men.', quote: 'No reaction was observed in this trial.', sourceId: pubmed.id, sourceKind: 'pubmed', stance: 'no_effect_observed', outcome: 'reaction' }, 'claim2'),
  ]) : response();
  return { response: responseClient, read: async () => text, search: async () => ['12022894'],
    fetch: async () => [{ pmid: '12022894', title: 'Controlled study', journal: 'Journal', year: '2002', abstractText: text, publicationTypes: ['Controlled Clinical Trial'], firstAuthor: 'Author' }],
    judge: fakeJudge, structured: fakeStructured };
}

describe('quote check and support judge', () => {
  it('normalizes unicode punctuation, case, newlines, and nonbreaking spaces', () => {
    expect(normalizeQuote(' “Patient’s”  risk—\n TEST ')).toBe('"patient\'s" risk- test');
    expect(quoteMatches('"patient\'s" risk- test', 'The “Patient’s”\u00a0risk—\n test exists.')).toBe(true);
    expect(quoteMatches('absent', text)).toBe(false);
    expect(quoteMatches('  ', text)).toBe(false);
  });
  it('skips the judge on a missing quote and judges a real overstated planted claim', async () => {
    let judgeCalls = 0;
    const judge: typeof fakeJudge = async (prompt, schema) => { judgeCalls++; return fakeJudge(prompt, schema); };
    const claims = await verifyClaims(plantedClaims({ ref: label, text }, 0, 'alcohol__metronidazole'), () => {}, { read: async () => text, judge });
    expect(claims.map(c => c.quoteCheck)).toEqual(['not_found', 'matched']);
    expect(claims[0].support).toBeUndefined(); expect(claims[1].support).toBe('overstated');
    expect(claims.every(c => !c.accepted && c.injected)).toBe(true); expect(judgeCalls).toBe(1);
  });
  it('limits concurrent judges to four and preserves claim order', async () => {
    let active = 0; let peak = 0;
    const judge: typeof fakeJudge = async (prompt, schema) => {
      peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, 3)); active--; return fakeJudge(prompt, schema);
    };
    const claims = await verifyClaims(Array.from({ length: 11 }, (_, i) => ({ ...proposed, id: `c${i}` })), () => {}, { read: async () => text, judge });
    expect(peak).toBe(1); expect(claims.map(c => c.id)).toEqual(Array.from({ length: 11 }, (_, i) => `c${i}`));
  });
  it('reads the exact source reference rather than matching another source', async () => {
    const claims = await verifyClaims([proposed], () => {}, { read: async ref => ref.id === label.id ? 'different source text' : text, judge: fakeJudge });
    expect(claims[0].accepted).toBe(false);
  });
});
describe('deterministic card policies', () => {
  const studyClaim: Claim = { ...accepted, id: 'c2', source: pubmed, stance: 'no_effect_observed', text: 'A trial observed no reaction.' };
  const study: Source = { ...pubmed, title: 'Study', citation: 'Author', url: 'https://example.org', design: 'controlled_trial' };
  it('derives depth only from accepted claims and exact source identities', () => {
    expect(deriveDepth([accepted], [])).toBe('label_only');
    expect(deriveDepth([accepted, studyClaim], [study])).toBe('human_studies');
    expect(deriveDepth([{ ...studyClaim, accepted: false }], [study])).toBe('limited');
    expect(deriveDepth([studyClaim], [{ ...study, design: 'case_report' }])).toBe('limited');
    expect(deriveDepth([], [])).toBe('limited');
  });
  it('detects opposing accepted stances on the same outcome only', () => {
    expect(deriveConflicts([accepted, studyClaim])).toEqual([{ outcome: 'reaction', sideA: ['c1'], sideB: ['c2'] }]);
    expect(deriveConflicts([accepted, { ...studyClaim, accepted: false }])).toEqual([]);
    expect(deriveConflicts([accepted, { ...studyClaim, outcome: 'other' }])).toEqual([]);
  });
  it.each([['Randomized Controlled Trial', 'rct'], ['Clinical Trial, Phase II', 'controlled_trial'], ['Observational Study', 'cohort'], ['Case-Control', 'case_control'], ['Case Reports', 'case_report'], ['Meta-Analysis', 'review'], ['Other', 'other']])('maps %s to %s', (value, design) => expect(publicationDesign([value])).toBe(design));
  it('drops banned words and uncited sentences, removing unknown IDs', () => {
    for (const word of ['safe', 'SHOULD', 'recommended', 'verified']) expect(hasBannedWords(`It is ${word}.`)).toBe(true);
    expect(hasBannedWords('The trial observed no reaction.')).toBe(false);
    expect(filterSentence({ text: 'Observed reaction.', claimIds: ['missing'] }, [accepted])).toBeUndefined();
    expect(filterSentence({ text: 'Observed reaction.', claimIds: ['missing', 'c1'] }, [accepted])?.claimIds).toEqual(['c1']);
    expect(filterSentence({ text: 'This is safe.', claimIds: ['c1'] }, [accepted])).toBeUndefined();
  });
  it('regenerates banned copy once, drops it again, and uses grounded headline/conflict fallbacks', async () => {
    let count = 0;
    const structured: Structured = async (_prompt, schema) => { count++; return schema.parse({ headline: { text: 'This is safe.', claimIds: ['c1'] }, reported: [{ text: 'You should take it.', claimIds: ['c1'] }], mechanism: [], conflicts: [] }); };
    const card = await synthesize([accepted, studyClaim], { structured, judge: fakeJudge });
    expect(count).toBe(2); expect(card.headline.claimIds).toEqual(['c1', 'c2']); expect(card.headline.text).toContain(studyClaim.text); expect(card.reported).toHaveLength(1);
    expect(card.conflicts[0].summary.claimIds).toEqual(['c1', 'c2']);
  });
  it('selects fixed questions deterministically', () => {
    const card = { a: 'metronidazole', b: 'alcohol', depth: 'label_only' as const, mechanism: [], conflicts: [], gaps: [] };
    expect(questions(card).map(q => q.trigger)).toEqual(['label_only', 'always', 'always']);
    expect(questions(card).every(q => q.text.endsWith('?') && !hasBannedWords(q.text))).toBe(true);
  });
});
describe('end to end agent with fake clients', () => {
  it('reads seed material, checks claims, rejects injections and ends with a timed card_ready', async () => {
    const events: TraceEvent[] = [];
    const record = await runEdge('alcohol__metronidazole', { ...fakeResearch(), inject: true, onEvent: e => events.push(e) });
    expect(record.card.depth).toBe('human_studies'); expect(record.card.conflicts).toHaveLength(1);
    expect(record.card.claims.filter(c => c.accepted)).toHaveLength(2);
    expect(record.card.claims.filter(c => c.injected).map(c => c.support ?? c.quoteCheck)).toEqual(['not_found', 'overstated']);
    expect(record.card.sources.find(s => s.kind === 'pubmed')).toMatchObject({ sampleSize: 12, citation: 'Author et al. · Journal 2002' });
    expect(record.card.sources.find(s => s.kind === 'pubmed')?.population).toBeUndefined();
    expect(record.card.reported).toHaveLength(1);
    expect(events.at(-1)?.type).toBe('card_ready'); expect(record.trace[0].t).toBeGreaterThanOrEqual(0);
    expect(record.trace.every((e, i) => i === 0 || e.t >= record.trace[i - 1].t)).toBe(true);
  });
  it('caps calls at 14 even if the model repeatedly omits search and records a bounded gap', async () => {
    const events: TraceEvent[] = [];
    const result = await research(edges[0], e => events.push(e), { read: async () => text, response: async () => response(Array.from({ length: 20 }, (_, i) => call('get_label_sections', { substanceId: 'acetaminophen' }, `${i}`))), search: async () => [] });
    expect(events.filter(e => e.type === 'tool_call')).toHaveLength(14);
    expect(result.queries).toHaveLength(1); expect(result.gaps).toHaveLength(1);
  });
  it('continues through previous_response_id and submits parallel outputs', async () => {
    const options = fakeResearch(); const seen: Parameters<Respond>[0][] = [];
    await research(edges.find(e => e.pair === 'alcohol__metronidazole')!, () => {}, { ...options, response: async (params, signal) => { seen.push(params); return options.response(params, signal); } });
    expect(seen[1].previous_response_id).toBe('r1'); expect(seen[1].input).toHaveLength(3);
  });
});
describe('identify', () => {
  it('maps curated names and aliases with word boundaries', () => {
    expect(mapReadText('FLAGYL 500 mg tablets')).toEqual(['metronidazole']);
    expect(mapReadText('Paracetamol')).toEqual(['acetaminophen']);
    expect(mapReadText('ibuprofen and warfarin')).toEqual(['ibuprofen', 'warfarin']);
    expect(mapReadText('notflagyl')).toEqual([]); expect(mapReadText('unknown medicine')).toEqual([]);
  });
  it('sends a Responses input_image data URL and maps only returned visible names', async () => {
    let captured: Parameters<Respond>[0] | undefined;
    const result = await identify('AAAA', 'image/png', async params => { captured = params; return response([], JSON.stringify({ reads: [{ readText: 'Flagyl', confidence: 'high' }, { readText: 'Unknown', confidence: 'low' }] })); });
    expect(JSON.stringify(captured)).toContain('"type":"input_image","image_url":"data:image/png;base64,AAAA"');
    expect(result.candidates.map(c => c.substanceId)).toEqual(['metronidazole', null]);
  });
});
