import { createRunContext } from '../runContext';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { judgeBatch } from '../judge';
import { verifyClaims, type ProposedClaim } from './verify';
import { externalFetch, requestCount, researchBudgetReached } from '../requests';
import { search } from '../tools/pubmed';
import { research } from './research';
import { runEdge } from './run';
import { edges } from '../../data/edges';
import { fakeJudgments } from './judgeFake';
import type { TraceEvent } from '../../shared/contract';

const upstream = vi.hoisted(() => ({ respond: vi.fn() }));
vi.mock('./runtime', async importOriginal => ({ ...await importOriginal<typeof import('./runtime')>(), respond: upstream.respond }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); upstream.respond.mockReset(); });
const verdict = (claimId: string) => ({ claimId, support: 'supports', rationale: 'Grounded.' });
const reply = (judgments: unknown[]) => ({ output_text: JSON.stringify({ judgments }) });
const proposed: ProposedClaim = { id: 'c1', text: 'A reaction was reported.', quote: 'Exact text.', source: { kind: 'pubmed', id: '12022894' }, stance: 'increases_risk', outcome: 'reaction' };

describe('M5.2 batch judging', () => {
  it('retries only missing, duplicated or invalid items and preserves valid verdicts', async () => {
    upstream.respond.mockResolvedValueOnce(reply([verdict('a'), verdict('b'), verdict('b'), { claimId: 'c', support: 'invalid' }, verdict('unknown')]))
      .mockResolvedValueOnce(reply([verdict('b'), verdict('c')]));
    const result = await judgeBatch(['a', 'b', 'c'].map(claimId => ({ claimId })), 'Judge');
    expect([...result.keys()]).toEqual(['a', 'b', 'c']);
    const retry = JSON.parse(upstream.respond.mock.calls[1][0].input.split('\n')[1]);
    expect(retry.map((item: { claimId: string }) => item.claimId)).toEqual(['b', 'c']);
    expect(upstream.respond.mock.calls[0][0]).toMatchObject({ model: 'muse-wonder-1.0', reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', strict: true } } });
  });
  it('honors Retry-After and rejects an exhausted batch without throwing', async () => {
    vi.useFakeTimers();
    upstream.respond.mockRejectedValue(Object.assign(new Error('429'), { headers: new Headers({ 'Retry-After': '2' }) }));
    const result = judgeBatch([{ claimId: 'a' }], 'Judge');
    await vi.advanceTimersByTimeAsync(1999);
    expect(upstream.respond).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).get('a')).toEqual({ support: 'does_not_support', rationale: 'Judge unavailable' });
    expect(upstream.respond).toHaveBeenCalledTimes(2);
  });
  it('batches all 17 claims into one call and emits one judgment per matched claim', async () => {
    const calls: number[] = []; const events: TraceEvent[] = [];
    const claims = await verifyClaims(Array.from({ length: 17 }, (_, i) => ({ ...proposed, id: `c${i}` })), e => events.push(e), {
      read: async () => proposed.quote,
      judge: async (prompt, schema) => {
        calls.push(JSON.parse(prompt.split('\n')[1]).length);
        return fakeJudgments(prompt, schema, () => ({ support: 'supports', rationale: 'Grounded.' }));
      },
    });
    expect(calls).toEqual([17]); expect(claims.every(c => c.accepted)).toBe(true);
    expect(events.filter(e => e.type === 'claim_judged')).toHaveLength(17);
  });
});

describe('M5.2 request limits', () => {
  it('holds at most four connections through body consumption and isolates concurrent runs', async () => {
    let active = 0; let peak = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      return new Response(new ReadableStream({ async start(controller) {
        await new Promise(resolve => setTimeout(resolve, 5)); active--; controller.close();
      } }));
    });
    {
      const context = createRunContext();
      await Promise.all(Array.from({ length: 12 }, async () => { const r = await externalFetch('https://fake', undefined, context); await r.text(); }));
      expect(requestCount(context)).toBe(12); expect(peak).toBe(4);
      expect(requestCount(createRunContext())).toBe(0);
      expect(requestCount(context)).toBe(12);
    }
  });
  it('counts PubMed retries and enforces the hard budget', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    {
      const context = createRunContext(1);
      await expect(search('fake', undefined, undefined, context)).rejects.toThrow('budget');
      expect(requestCount(context)).toBe(1);
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  it('stops retrieval with ten requests reserved and reuses seed abstracts', async () => {
    const edge = edges.find(e => e.pair === 'alcohol__metronidazole')!;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(''));
    const searchFake = vi.fn(async () => []);
    {
      const context = { ...createRunContext(11), research: true };
      await externalFetch('https://fake', undefined, context).then(r => r.text());
      expect(researchBudgetReached(context)).toBe(true);
      await research(edge, () => {}, { context, read: async () => 'Exact text.', search: searchFake,
        fetch: async () => [], response: async () => ({ id: 'r', output: [], output_text: '' }) });
      expect(searchFake).not.toHaveBeenCalled();
      await expect(externalFetch('https://fake', undefined, context)).rejects.toThrow('budget');
    }
  });
});

it('continues to a deterministic card when the challenge request fails', async () => {
  const edge = edges.find(e => e.pair === 'alcohol__metronidazole')!;
  let turn = 0; const events: TraceEvent[] = [];
  const result = await runEdge(edge.pair, {
    read: async () => proposed.quote, fetch: async () => [], search: async () => [],
    response: async () => {
      if (++turn > 2) throw new Error('challenge unavailable');
      return { id: 'r', output_text: '', output: turn === 1 ? [proposed, { ...proposed, quote: 'Missing quote.' }].map((c, i) => ({
        type: 'function_call', call_id: String(i), name: 'record_claim', arguments: JSON.stringify({ text: c.text, quote: c.quote, sourceKind: edge.seedSources[0].kind, sourceId: edge.seedSources[0].id, stance: c.stance, outcome: c.outcome }),
      })) : [] };
    },
    judge: async (prompt, schema) => fakeJudgments(prompt, schema, () => ({ support: 'supports', rationale: 'Grounded.' })),
    structured: async () => { throw new Error('synthesis unavailable'); }, onEvent: e => events.push(e),
  });
  expect(result.card.claims.filter(c => c.accepted)).toHaveLength(1);
  expect(events.some(e => e.type === 'thinking' && e.text.startsWith('Skipped the challenge round:'))).toBe(true);
  expect(events.at(-2)).toEqual({ type: 'thinking', text: 'Made 0 external requests' });
  expect(events.at(-1)?.type).toBe('card_ready');
});
