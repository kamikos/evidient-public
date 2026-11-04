import { createRunContext } from '../runContext';
import { fakeJudgments } from './judgeFake';
import { describe, expect, it, vi } from 'vitest';
import type { Claim, TraceEvent } from '../../shared/contract';
import { edges } from '../../data/edges';
import { getSourceText, rememberSource } from '../tools/sourceStore';
import { verifyClaims, type ProposedClaim } from './verify';
import { research } from './research';
import { synthesize } from './synthesize';
import { runEdge } from './run';
import type { Respond } from './runtime';
const source = { kind: 'pubmed' as const, id: '12022894' };
const proposed: ProposedClaim = { id: 'c1', source, quote: 'Exact text.', text: 'A reaction was reported.', stance: 'increases_risk', outcome: 'reaction' };
const accepted: Claim = { ...proposed, accepted: true, quoteCheck: 'matched', support: 'supports' };
const judge: NonNullable<Parameters<typeof verifyClaims>[2]>['judge'] = async (_prompt, schema) => fakeJudgments(_prompt, schema, itemPrompt => ({ support: 'supports', rationale: 'Supported.' }));
describe('M5.1 run resilience', () => {
  it('preserves exact run text ahead of snapshots and concurrent runs', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not refetch'));
    try {
      await Promise.all(['first run', 'second run'].map(async text => {
        const context = createRunContext();
        rememberSource(source, text, context);
        await Promise.resolve();
        expect(await getSourceText(source, undefined, context)).toBe(text);
      }));
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it('registers the label and new abstract text research actually reads', async () => {
    const edge = edges.find(e => e.pair === 'alcohol__metronidazole')!;
    {
      const context = createRunContext();
      let turn = 0;
      const response: Respond = async () => ({ id: 'r', output_text: '', output: ++turn === 1 ? [{ type: 'function_call', call_id: 'f', name: 'fetch_abstracts', arguments: JSON.stringify({ pmids: ['37494646'] }) }] : [] });
      const researched = await research(edge, () => {}, { context, read: async () => 'Label as read.', response, search: async () => [], fetch: async ids => ids.map(pmid => ({ pmid, title: 'Study', journal: 'J', year: '2023', abstractText: 'Abstract as read.', publicationTypes: [] })) });
      expect(await getSourceText(edge.seedSources[0], undefined, context)).toBe('Label as read.');
      expect(await getSourceText({ kind: 'pubmed', id: '37494646' }, undefined, context)).toBe('Abstract as read.');
      expect(researched.sources.get('pubmed:37494646')?.text).toBe('Abstract as read.');
    }
  });
  it('rejects unreadable sources and unavailable judges while continuing other claims', async () => {
    const events: TraceEvent[] = [];
    const claims = await verifyClaims([proposed, { ...proposed, id: 'c2', source: { ...source, id: '2' } }, { ...proposed, id: 'c3', text: 'A different reaction was reported.' }], e => events.push(e), {
      read: async ref => { if (ref.id === '2') throw new Error('secret source URL'); return proposed.quote; },
      judge: async (prompt, schema, signal) => { return fakeJudgments(prompt, schema, item => ({ support: item.includes('different reaction') ? 'does_not_support' : 'supports', rationale: item.includes('different reaction') ? 'Judge unavailable' : 'Supported.' })); },
    });
    expect(claims.map(c => c.accepted)).toEqual([true, false, false]);
    expect(claims[1]).toMatchObject({ quoteCheck: 'not_found', judgeRationale: 'Source text unavailable for checking' });
    expect(claims[2]).toMatchObject({ quoteCheck: 'matched', support: 'does_not_support', judgeRationale: 'Judge unavailable' });
    expect(events.filter(e => e.type === 'quote_checked')).toHaveLength(3);
    expect(JSON.stringify(events)).not.toContain('secret');
  });
  it('propagates cancellation rather than converting it into rejection', async () => {
    const controller = new AbortController();
    await expect(verifyClaims([proposed], () => {}, { signal: controller.signal, read: async () => { controller.abort(new Error('cancelled')); throw new Error('read failed'); } })).rejects.toThrow('cancelled');
  });
  it('uses only accepted claim text when generation or sentence judging fails', async () => {
    const rejected = { ...accepted, id: 'bad', text: 'Fabricated.', accepted: false };
    const card = await synthesize([accepted, rejected], { structured: async () => { throw new Error('unavailable'); } });
    expect(card.headline).toEqual({ text: accepted.text, claimIds: ['c1'] });
    expect(JSON.stringify(card)).not.toContain('Fabricated');
    const judged = await synthesize([accepted], { structured: async (_prompt, schema) => schema.parse({ headline: card.headline, reported: [], mechanism: [], conflicts: [] }), judge: async () => { throw new Error('judge failed'); } });
    expect(judged.headline).toEqual(card.headline);
    await expect(synthesize([], { structured: async () => { throw new Error('unavailable'); } })).rejects.toThrow('No accepted claims');
  });
  it('completes a full card when one judge, metadata and synthesis fail', async () => {
    const edge = edges.find(e => e.pair === 'alcohol__metronidazole')!;
    const events: TraceEvent[] = [];
    let turn = 0;
    const record = await runEdge(edge.pair, {
      read: async () => proposed.quote, search: async () => [],
      fetch: async ids => ids.map(pmid => ({ pmid, title: 'Study', journal: 'J', year: '2002', abstractText: proposed.quote, publicationTypes: [] })),
      response: async () => ({ id: 'r', output_text: '', output: ++turn === 1 ? [edge.seedSources[0], source].map((ref, i) => ({ type: 'function_call', call_id: String(i), name: 'record_claim', arguments: JSON.stringify({ text: i ? 'A reaction was reported.' : 'A different reaction was reported.', quote: proposed.quote, sourceKind: ref.kind, sourceId: ref.id, stance: 'increases_risk', outcome: 'reaction' }) })) : [] }),
      judge: async (prompt, schema) => { return fakeJudgments(prompt, schema, item => ({ support: item.includes('different reaction') ? 'does_not_support' : 'supports', rationale: item.includes('different reaction') ? 'Judge unavailable' : 'Supported.' })); },
      structured: async () => { throw new Error('generation down'); }, onEvent: e => events.push(e),
    });
    expect(record.card.claims.map(c => c.accepted)).toEqual([false, true]);
    expect(record.card.headline).toEqual({ text: proposed.text, claimIds: ['c2'] });
    expect(record.card.sources.find(s => s.kind === 'pubmed')?.title).toBe('Study');
    expect(events.at(-1)?.type).toBe('card_ready');
    expect(events.some(e => e.type === 'error')).toBe(false);
  });
  it('reports a safe stage on research failure', async () => {
    const events: TraceEvent[] = [];
    await expect(runEdge('alcohol__metronidazole', { onEvent: e => events.push(e), read: async () => { throw new Error('secret stack and credentials'); } })).rejects.toThrow('during research');
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Evidence generation failed during research. Please retry.', recoverable: true });
    expect(JSON.stringify(events)).not.toContain('secret');
  });
});
