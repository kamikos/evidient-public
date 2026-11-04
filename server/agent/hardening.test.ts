import { fakeJudgments } from './judgeFake';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasBannedWords } from './advice';
import { verifyClaims, type ProposedClaim } from './verify';
import { synthesize } from './synthesize';
import { buildSources, contentOverlap, sampleSizeInQuote } from './sources';
import { identify } from '../identify';
import { research } from './research';
import { runEdge } from './run';
import { edges } from '../../data/edges';
import type { Respond, Structured } from './runtime';
import type { Claim, TraceEvent } from '../../shared/contract';
import type { judgeStructured } from '../judge';
const edge = edges.find(e => e.pair === 'alcohol__metronidazole')!;
const source = edge.seedSources[0];
const quote = 'A reaction was reported.';
const proposed: ProposedClaim = { id: 'c1', text: 'The label reports a reaction.', quote, source, stance: 'increases_risk', outcome: 'reaction' };
const accepted: Claim = { ...proposed, accepted: true, quoteCheck: 'matched', support: 'supports' };
const judge: typeof judgeStructured = async (_prompt, schema) => fakeJudgments(_prompt, schema, itemPrompt => ({ support: 'supports', rationale: 'Supported.' }));
const result = (output: Awaited<ReturnType<Respond>>['output'] = [], output_text = ''): Awaited<ReturnType<Respond>> => ({ id: 'response1', output, output_text });
const call = (name: string, args: object, id = name): Awaited<ReturnType<Respond>>['output'][number] => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id });
const recordClaim = (overrides = {}) => ({ text: proposed.text, quote, sourceKind: source.kind, sourceId: source.id, stance: proposed.stance, outcome: proposed.outcome, ...overrides });
const structured: Structured = async (_prompt, schema, name) => schema.parse(name === 'study_metadata' ? { sampleSize: null, population: null, limitations: [] } : { headline: { text: proposed.text, claimIds: ['c1'] }, reported: [], mechanism: [], conflicts: [] });
afterEach(() => vi.useRealTimers());
describe('M3.1 advice and acceptance', () => {
  it.each(['with close monitoring of patients receiving the combination', 'with a direction to avoid alcohol', 'caution noted for operating machinery', 'instructions to drink water', 'safe', 'OK to take together', 'okay to combine', 'fine to use', 'should', 'must', 'recommend', 'recommended', 'advis', 'advised', 'advisory', 'verified', 'Wait 24 hours', 'wait 3 days', 'Take twice the dose', 'take double', 'take half', 'take 2 tablets', 'Take medicine', 'Avoid alcohol', 'Stop treatment', 'Wait here', 'Drink water', 'Do not combine', "Don't combine", 'It is safe', 'it is fine', 'it is ok', 'Reported. Take medicine'])('blocks advice pattern %s in sentences and claims', async text => {
    expect(hasBannedWords(text)).toBe(true);
    const [claim] = await verifyClaims([{ ...proposed, text }], () => {}, { read: async () => quote, judge });
    expect(claim).toMatchObject({ accepted: false, support: 'overstated', judgeRationale: 'contains advice wording' });
  });
  it('allows attributed label instructions to be independently judged', async () => {
    expect((await verifyClaims([{ ...proposed, text: 'The label says avoid alcohol.' }], () => {}, { read: async () => quote, judge }))[0].accepted).toBe(true);
  });
  it('keeps partial support rejected and sends stance semantics to the judge', async () => {
    let prompt = '';
    const claims = await verifyClaims([proposed, { ...proposed, id: 'c2', stance: 'no_effect_observed' }], () => {}, { read: async () => quote,
      judge: async (input, schema) => { prompt = input; return fakeJudgments(input, schema, itemPrompt => ({ support: itemPrompt.includes('"stance":"no_effect_observed"') ? 'does_not_support' : 'partial', rationale: 'Stance or scope mismatch.' })); } });
    expect(claims.map(c => c.support)).toEqual(['partial', 'does_not_support']);
    expect(claims.every(c => !c.accepted)).toBe(true);
    expect(prompt).toContain('A stance mismatch is does_not_support');
    expect(prompt).toContain('control WITHOUT the interacting drug');
    expect(prompt).toContain('Comparing subgroups who ALL received the interacting drug');
  });
});
describe('M3.1 sentence support', () => {
  it('judges every sentence with only accepted citations and drops unsupported copy', async () => {
    const prompts: string[] = []; const events: TraceEvent[] = [];
    const mechanism: Claim = { ...accepted, id: 'c3', stance: 'mechanism' };
    const card = await synthesize([accepted, { ...accepted, id: 'c2', accepted: false }, mechanism, { ...accepted, id: 'c4', stance: 'no_effect_observed' }], {
      structured: async (_prompt, schema) => schema.parse({ headline: { text: 'Unsupported headline.', claimIds: ['c1', 'c2'] }, reported: [{ text: 'Supported report.', claimIds: ['c1', 'c2'] }, { text: 'Zero citations.', claimIds: ['c2'] }], mechanism: [{ text: 'Overstated mechanism.', claimIds: ['c3'] }], conflicts: [{ outcome: 'reaction', summary: { text: 'Unsupported conflict.', claimIds: ['c1', 'c4'] } }] }),
      judge: async (prompt, schema) => { prompts.push(prompt); return fakeJudgments(prompt, schema, itemPrompt => ({ support: itemPrompt.includes('Unsupported') ? 'does_not_support' : itemPrompt.includes('Overstated') ? 'overstated' : 'supports', rationale: 'Scope assessed.' })); }, emit: e => events.push(e),
    });
    expect(prompts).toHaveLength(1); expect(prompts.join('')).not.toContain('"id":"c2"'); expect(prompts[0]).toContain(quote);
    expect(card.headline.claimIds).toEqual(['c1', 'c4']); expect(card.reported).toEqual([{ text: 'Supported report.', claimIds: ['c1'] }]);
    expect(card.mechanism).toEqual([]); expect(card.conflicts).toHaveLength(1);
    expect(card.conflicts[0].summary.claimIds).toEqual(['c1', 'c4']);
    expect(card.conflicts[0].summary.text).not.toContain('Unsupported');
    expect(events).toContainEqual({ type: 'thinking', text: 'Checked 5 card sentences against their claims; dropped 4.' });
  });
});
describe('M3.1 metadata', () => {
  it('requires literal numbers and sixty percent content overlap', async () => {
    expect(sampleSizeInQuote(12, 'Twelve participants.')).toBe(true); expect(sampleSizeInQuote(24, 'twenty-four participants.')).toBe(true);
    expect(sampleSizeInQuote(1200, '1,200 participants.')).toBe(true); expect(sampleSizeInQuote(12, '112 participants.')).toBe(false);
    expect(sampleSizeInQuote(12, 'Participants were healthy.')).toBe(false);
    expect(contentOverlap('healthy adult male participants', 'healthy adult male volunteers')).toBe(true);
    expect(contentOverlap('pregnant elderly women', 'healthy adult male volunteers')).toBe(false);
    const text = 'Twelve healthy adult male volunteers participated. Small sample size. You should wait.';
    const ref = { kind: 'pubmed' as const, id: '123' };
    const data = { claims: [], gaps: [], queries: [], challenge: async () => [], sources: new Map([['pubmed:123', { ref, text }]]), articles: new Map([['123', { pmid: '123', title: 'Study', journal: 'J', year: '2000', abstractText: text, publicationTypes: [], firstAuthor: 'A' }]]) };
    const [study] = await buildSources(data, { structured: async (_prompt, schema) => schema.parse({ sampleSize: { value: 99, quote: text }, population: { value: 'pregnant elderly women', quote: text }, limitations: [{ value: 'Small sample size', quote: 'Small sample size.' }, { value: 'You should wait', quote: 'You should wait.' }, { value: 'Severe attrition', quote: text }] }) });
    expect(study.sampleSize).toBeUndefined(); expect(study.population).toBeUndefined(); expect(study.limitations).toEqual(['Small sample size']);
  });
});
describe('M3.1 identify', () => {
  it('sends strict text.format, strips fences and retries schema-invalid output once', async () => {
    let count = 0;
    const value = await identify('AAAA', 'image/png', async params => {
      expect(params.text?.format?.type).toBe('json_schema'); count++;
      return result([], count === 1 ? '{"reads":[{"confidence":"invalid"}]}' : '```json\n{"reads":[{"readText":"Flagyl","confidence":"high"}]}\n```');
    });
    expect(count).toBe(2); expect(value.candidates[0].substanceId).toBe('metronidazole');
  });
  it('fails clearly after exactly two invalid outputs', async () => {
    const response = vi.fn<Respond>(async () => result([], 'bad'));
    await expect(identify('AAAA', 'image/png', response)).rejects.toThrow('invalid structured output after two attempts'); expect(response).toHaveBeenCalledTimes(2);
  });
});
describe('M3.1 research and challenge', () => {
  it('feeds forced search and fetched text back before recording within fourteen calls', async () => {
    const events: TraceEvent[] = []; let turn = 0;
    const data = await research(edge, e => events.push(e), { read: async () => quote, fetch: async () => [], search: async () => ['123'], response: async params => {
      if (++turn === 1) return result(Array.from({ length: 20 }, (_, i) => call('get_label_sections', { substanceId: edge.a }, String(i))));
      expect(JSON.stringify(params.input)).toContain('Mandatory search and fetch results'); expect(JSON.stringify(params.input)).toContain('123');
      return result([call('record_gap', { text: 'No human study found.', searched: [`${edge.a} ${edge.b} (clinical trial OR cohort OR humans)`] })]);
    } });
    expect(events.filter(e => e.type === 'tool_call').map(e => e.type === 'tool_call' && e.name).slice(-3)).toEqual(['search_pubmed', 'fetch_abstracts', 'record_gap']);
    expect(events.filter(e => e.type === 'tool_call')).toHaveLength(14); expect(data.gaps).toHaveLength(1);
  });
  it('refuses a no-study gap when fetched abstracts address the combination', async () => {
    let turn = 0;
    const data = await research(edge, () => {}, { read: async () => quote, search: async () => ['123'], fetch: async ids => ids.map(pmid => ({ pmid, title: 'Study', journal: 'J', year: '2000', firstAuthor: 'A', publicationTypes: [], abstractText: 'alcohol metronidazole tested in humans.' })),
      response: async () => ++turn === 1 ? result([call('search_pubmed', { query: 'pair' }), call('fetch_abstracts', { pmids: ['123'] }), call('record_gap', { text: 'No human study found.', searched: ['pair'] })]) : result(),
    });
    expect(data.gaps).toEqual([]);
  });
  it('challenges quote-not-found claims once and re-verifies corrected claims in the ledger', async () => {
    let turn = 0; const events: TraceEvent[] = [];
    const record = await runEdge(edge.pair, { read: async () => quote, search: async () => [], fetch: async ids => ids.map(pmid => ({ pmid, title: 'Study', journal: 'J', year: '2000', firstAuthor: 'A', publicationTypes: [], abstractText: quote })), judge, structured,
      onEvent: e => events.push(e), response: async params => {
        turn++;
        if (turn === 1) return result([call('record_claim', recordClaim({ quote: 'Invented quotation.' }))]);
        if (JSON.stringify(params.input).includes('These claims failed quote matching')) return result([call('record_claim', recordClaim())]);
        return result();
      },
    });
    expect(record.card.claims.map(c => [c.quoteCheck, c.accepted])).toEqual([['not_found', false], ['matched', true]]);
    expect(events).toContainEqual({ type: 'thinking', text: 'Challenging 1 rejected claims' });
  });
  it('feeds targeted search and fetch results through one challenge round before re-verification', async () => {
    let turn = 0; const events: TraceEvent[] = [];
    const record = await runEdge(edge.pair, { read: async () => quote, search: async query => query === 'targeted' ? ['999'] : [],
      fetch: async ids => ids.map(pmid => ({ pmid, title: 'Study', journal: 'J', year: '2000', firstAuthor: 'A', publicationTypes: [], abstractText: quote })), judge, structured, onEvent: e => events.push(e),
      response: async params => {
        turn++;
        if (turn === 1) return result([call('record_claim', recordClaim({ quote: 'Missing quote.' }))]);
        const input = JSON.stringify(params.input);
        if (input.includes('These claims failed quote matching')) return result([call('search_pubmed', { query: 'targeted' })]);
        if (input.includes('pmids') && input.includes('999')) return result([call('fetch_abstracts', { pmids: ['999'] })]);
        if (input.includes('abstractText')) return result([call('record_claim', recordClaim({ sourceKind: 'pubmed', sourceId: '999' }))]);
        return result();
      },
    });
    expect(record.card.claims.at(-1)).toMatchObject({ source: { kind: 'pubmed', id: '999' }, accepted: true });
    expect(events.filter(e => e.type === 'thinking' && e.text.startsWith('Challenging'))).toHaveLength(1);
  });
  it('never records an absence gap after a failed search', async () => {
    const events: TraceEvent[] = [];
    await expect(research(edge, e => events.push(e), { read: async () => quote, fetch: async () => [], response: async () => result(), search: async () => { throw new Error('network down'); } })).rejects.toThrow('network down');
    expect(events.some(e => e.type === 'gap_recorded')).toBe(false);
  });
  it('aborts the whole run at 240 seconds and emits a terminal non-recoverable error', async () => {
    vi.useFakeTimers(); const events: TraceEvent[] = []; let signal: AbortSignal | undefined;
    const work = runEdge(edge.pair, { read: async (_ref, inputSignal) => { signal = inputSignal; return new Promise(() => {}); }, onEvent: e => events.push(e) });
    const rejected = expect(work).rejects.toThrow('240-second run limit');
    await vi.advanceTimersByTimeAsync(240_000); await rejected;
    expect(signal?.aborted).toBe(true); expect(events.at(-1)).toMatchObject({ type: 'error', recoverable: false }); expect(vi.getTimerCount()).toBe(0);
  });
});


it('reads the other substance label when it is absent from the seed list', async () => {
  const pair = edges.find(item => item.pair === 'diphenhydramine__zolpidem')!;
  const reads: string[] = [];
  let turn = 0;
  const researched = await research(pair, () => {}, {
    read: async ref => { reads.push(ref.id); return quote; }, search: async () => [], fetch: async () => [],
    response: async () => ++turn === 1 ? result([call('get_label_sections', { substanceId: 'zolpidem' })]) : result(),
  });
  const id = '25e71199-c55d-4cc6-8388-b309d654d2b0#drug_interactions';
  expect(reads).toContain(id);
  expect(researched.sources.has(`fda_label:${id}`)).toBe(true);
});
it('drops a conflict when both generated and verbatim fallback summaries fail independent judgment', async () => {
  let calls = 0;
  const card = await synthesize([accepted, { ...accepted, id: 'c4', stance: 'no_effect_observed' }], {
    structured, judge: async (_prompt, schema) => { calls++; return fakeJudgments(_prompt, schema, itemPrompt => ({ support: 'does_not_support', rationale: 'Not supported.' })); },
  });
  expect(calls).toBe(1);
  expect(card.conflicts).toEqual([]);
});
it('bounds gaps to one plain adult sentence and does not add population fallback searches', async () => {
  let turn = 0;
  const data = await research(edge, () => {}, { read: async () => quote, search: async () => [], fetch: async () => [], response: async () => ++turn === 1 ? result([
    call('search_pubmed', { query: 'metronidazole alcohol controlled adults' }),
    call('record_gap', { text: Array(26).fill('word').join(' ') + '.', searched: ['metronidazole alcohol controlled adults'] }),
    call('record_gap', { text: 'Within the retrieved results for pair: No study found.', searched: ['metronidazole alcohol controlled adults'] }),
    call('record_gap', { text: 'No controlled human study of metronidazole with alcohol was found in PubMed.', searched: ['metronidazole alcohol controlled adults'] }),
    call('record_gap', { text: 'No adult cohort of metronidazole with alcohol was found in PubMed.', searched: ['metronidazole alcohol controlled adults'] }),
    call('record_gap', { text: 'No adult case series was found.', searched: ['metronidazole alcohol controlled adults'] }),
  ]) : result() });
  expect(data.gaps).toHaveLength(1);
  expect(data.gaps[0].text).toContain('No controlled human study');
  expect(data.gaps.every(g => !g.text.includes('Within the retrieved results'))).toBe(true);
  expect(data.queries.every(q => !/pregnan|children/i.test(q))).toBe(true);
});
it('refuses population searches unless fetched sources raise the population', async () => {
  let turn = 0;
  const search = vi.fn(async () => []);
  const data = await research(edge, () => {}, { read: async () => quote, search, fetch: async () => [], response: async () => ++turn === 1 ? result([call('search_pubmed', { query: 'metronidazole alcohol pregnancy' })]) : result() });
  expect(data.queries).not.toContain('metronidazole alcohol pregnancy');
  expect(search.mock.calls.flat()).not.toContain('metronidazole alcohol pregnancy');
});
it('uses journal and year when a fetched article has no author', async () => {
  const ref = { kind: 'pubmed' as const, id: '123' };
  const data = { claims: [], gaps: [], queries: [], challenge: async () => [], sources: new Map([['pubmed:123', { ref, text: quote }]]), articles: new Map([['123', { pmid: '123', title: 'Study', journal: 'The Medical Letter', year: '2023', abstractText: quote, publicationTypes: [], firstAuthor: '' }]]) };
  const [source] = await buildSources(data, { structured });
  expect(source.citation).toBe('The Medical Letter · 2023');
});
