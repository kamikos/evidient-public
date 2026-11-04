import { afterEach, expect, it, vi } from 'vitest';
import { runRequestedPair } from './request';
import { createRunContext } from '../runContext';
import { externalFetch, requestCount, researchBudgetReached } from '../requests';
import { getSourceText, rememberSource } from '../tools/sourceStore';
import { fakeJudgments } from './judgeFake';
import { judgeBatch } from '../judge';
import type { RunContext } from '../runContext';
import type { TraceEvent } from '../../shared/contract';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it('gives consecutive runs fresh budgets and judges through independently loaded modules', async () => {
  vi.stubEnv('MAX_RUN_REQUESTS', '12');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('ok'));
  vi.resetModules();
  const otherRouteRequests = await import('../requests');
  const contexts: RunContext[] = [];
  for (let run = 0; run < 2; run++) {
    let turn = 0;
    let judges = 0;
    const ref = { kind: 'fda_label' as const, id: 'same#drug_interactions' };
    const quote = `The label reports effect ${run}.`;
    const result = await runRequestedPair('ibuprofen', 'lisinopril', {
      labels: async (_side, signal, context) => {
        if (!contexts.includes(context!)) {
          contexts.push(context!);
          expect(requestCount(context)).toBe(0);
          expect(context?.sources.size).toBe(0);
          await (await otherRouteRequests.externalFetch('https://fake/label', { signal }, context)).text();
        }
        return [{ ...ref, setId: 'same', section: 'drug_interactions', text: quote, url: '' }];
      }, classes: async () => [], search: async () => [], fetch: async () => [],
      response: async (_params, signal, context) => {
        if (!turn++) {
          expect(await getSourceText(ref, signal, context)).toBe(quote);
          await (await externalFetch('https://fake/research', { signal }, context)).text();
          expect(researchBudgetReached(context)).toBe(true);
          return { id: 'r', output_text: '', output: [{ type: 'function_call', call_id: 'c', name: 'record_claim', arguments: JSON.stringify({ text: quote, quote, sourceId: ref.id, sourceKind: ref.kind, stance: 'increases_risk', outcome: 'effect' }) }] };
        }
        return { id: 'r', output_text: '', output: [] };
      },
      judge: async (prompt, schema, signal, context) => {
        judges++;
        expect(context?.research).toBe(false);
        await (await otherRouteRequests.externalFetch('https://fake/judge', { signal }, context)).text();
        return fakeJudgments(prompt, schema, () => ({ support: 'supports', rationale: 'Grounded.' }));
      }, structured: async () => { throw new Error('Use grounded fallback'); },
    });
    expect(result.card.claims[0].accepted).toBe(true);
    expect(judges).toBe(1);
    expect(requestCount(contexts[run])).toBe(3);
    expect(contexts[run].requests.max).toBe(12);
    for (let i = 3; i < 12; i++) await (await externalFetch('https://fake/exhaust', undefined, contexts[run])).text();
    await expect(externalFetch('https://fake/exhausted', undefined, contexts[run])).rejects.toThrow('budget');
  }
  expect(contexts[0].requests).not.toBe(contexts[1].requests);
  expect(contexts[0].sources).not.toBe(contexts[1].sources);
});
it('does not cross the four-connection cap while bodies are held', async () => {
  let active = 0; let peak = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    return new Response(new ReadableStream({ start(controller) { setTimeout(() => { active--; controller.close(); }, 5); } }));
  });
  const context = createRunContext();
  await Promise.all(Array.from({ length: 12 }, async () => (await externalFetch('https://fake', undefined, context)).text()));
  expect(peak).toBe(4);
  expect(context.requests.active).toBe(0);
});
it('rejects daily model spend before preparation and emits a non-recoverable error', async () => {
  vi.stubEnv('MODEL_SPEND_CAP_USD', '2');
  const prepare = vi.fn(); const events: TraceEvent[] = [];
  await expect(runRequestedPair('ibuprofen', 'lisinopril', { labels: prepare, onEvent: e => events.push(e) })).rejects.toThrow('daily model budget reached');
  expect(prepare).not.toHaveBeenCalled();
  expect(events).toEqual([{ type: 'error', message: 'Live runs are paused: daily model budget reached', recoverable: false }]);
});
it('reports safe underlying judge error classes without provider messages', async () => {
  const events: TraceEvent[] = [];
  await judgeBatch([{ claimId: 'c1' }], 'Judge', { emit: e => events.push(e), judge: async () => { throw Object.assign(new Error('secret provider payload'), { status: 429 }); } });
  expect(events).toContainEqual({ type: 'thinking', text: 'Independent judge failed: HTTP 429.' });
  expect(JSON.stringify(events)).not.toContain('secret');
  const context = createRunContext();
  rememberSource({ kind: 'pubmed', id: 'unique' }, 'only this run', context);
  expect(createRunContext().sources.size).toBe(0);
});
