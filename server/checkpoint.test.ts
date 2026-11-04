import { afterEach, expect, it, vi } from 'vitest';
import { withJournal, signJournal, readJournal, chargeUsage } from './checkpoint';
import { newJournal } from './live';
import { externalFetch } from './requests';
import { createRunContext } from './runContext';
import { streamEvidence } from './sse';
import { POST } from '../app/api/continue+api';
import { createLimiter } from './limits';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const request = () => new Request('http://localhost/api/evidence/alcohol__lorazepam?live=1');
it('authenticates compressed and plain state, rejects tampering and expiry', async () => {
  vi.stubEnv('MODEL_API_KEY', 'test-key');
  for (const size of [10, 210_000]) {
    const journal = newJournal(request());
    journal.entries.push({ key: 'source', status: 200, headers: [], body: 'x'.repeat(size) });
    const token = await signJournal(journal);
    expect(await readJournal(token)).toEqual(journal);
    expect(token.startsWith(size > 200_000 ? 'gz.' : 'json.')).toBe(true);
    const parts = token.split('.'); parts[1] = (parts[1][0] === 'A' ? 'B' : 'A') + parts[1].slice(1);
    await expect(readJournal(parts.join('.'))).rejects.toThrow();
    journal.started -= 601_000;
    await expect(readJournal(await signJournal(journal))).rejects.toThrow('Expired');
  }
  expect((await POST(new Request('http://localhost/api/continue', { method: 'POST', body: JSON.stringify({ state: 'fake' }) }))).status).toBe(400);
});
it('limits each invocation to eight actual fetches, including concurrent calls, and replays exact text', async () => {
  vi.stubEnv('MAX_INVOCATION_FETCHES', '10');
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(`exact ${String(input)}\nverbatim`));
  const journal = newJournal(request());
  for (let phase = 0; phase < 3; phase++) {
    const start = fetch.mock.calls.length;
    const abort = new AbortController();
    await withJournal(journal, abort, async () => {
      const context = createRunContext(50);
      for (let group = 0; group < 5; group++) {
        const results = await Promise.allSettled(Array.from({ length: 4 }, async (_, i) => {
          const url = `https://fake/${group * 4 + i}`;
          const response = await externalFetch(url, { signal: abort.signal }, context);
          expect(await response.text()).toBe(`exact ${url}\nverbatim`);
        }));
        if (results.some(result => result.status === 'rejected')) break;
      }
    });
    expect(fetch.mock.calls.length - start).toBe(phase === 2 ? 4 : 8);
  }
  expect(fetch).toHaveBeenCalledTimes(20);
});
it('frames a terminal checkpoint, suppresses replayed events and consumes quota only for the initial run', async () => {
  vi.stubEnv('MODEL_API_KEY', 'key'); vi.stubEnv('LIVE_RUNS', 'on');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('text'));
  fetch.mockImplementation(async () => new Response('text'));
  const limiter = createLimiter();
  const journal = newJournal(request());
  expect(limiter(request(), 'live')).toBeUndefined();
  let total = 0;
  for (let phase = 0; phase < 3; phase++) {
    const response = streamEvidence(request(), async options => {
      options.onEvent?.({ type: 'thinking', text: 'Once only' });
      const context = createRunContext(50);
      for (let i = 0; i < 18; i++) await (await externalFetch(`https://fake/${i}`, { signal: options.signal }, context)).text();
      options.onEvent?.({ type: 'error', message: 'Terminal fake', recoverable: false });
    }, journal);
    const raw = await response.text();
    total += raw.split('Once only').length - 1;
    if (phase < 2) {
      const event = JSON.parse(raw.split('\n').find(line => line.includes('"checkpoint"'))!.slice(6));
      expect(event.next).toBe('/api/continue');
      Object.assign(journal, await readJournal(event.state));
    } else expect(raw).toContain('Terminal fake');
  }
  expect(total).toBe(1); expect(fetch).toHaveBeenCalledTimes(18);
  expect(limiter(request(), 'live')).toBeUndefined();
  expect(limiter(request(), 'live')).toBeUndefined();
  expect(limiter(request(), 'live')?.status).toBe(429);
});
it('charges model usage once across replay and resumes charging for new calls', async () => {
  const journal = newJournal(request());
  await withJournal(journal, new AbortController(), async () => { expect(chargeUsage()).toBe(true); expect(chargeUsage()).toBe(true); });
  await withJournal(journal, new AbortController(), async () => { expect(chargeUsage()).toBe(false); expect(chargeUsage()).toBe(false); expect(chargeUsage()).toBe(true); });
});
it('the simulation reproduces the Workers error without checkpointing', async () => {
  vi.stubEnv('MAX_INVOCATION_FETCHES', '10');
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('ok'));
  const context = createRunContext(50);
  for (let i = 0; i < 10; i++) await (await externalFetch('https://fake', undefined, context)).text();
  await expect(externalFetch('https://fake', undefined, context)).rejects.toThrow('Too many subrequests');
  expect(fetch).toHaveBeenCalledTimes(10);
});
it('counts repeated attempts separately and resumes a retry after a checkpoint', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('retry', { status: 503 }));
  const journal = newJournal(request());
  for (let phase = 0; phase < 2; phase++) {
    const abort = new AbortController();
    await withJournal(journal, abort, async () => {
      const context = createRunContext(50);
      try {
        for (let attempt = 0; attempt < 9; attempt++) {
          const response = await externalFetch('https://fake/retry', { signal: abort.signal }, context);
          expect(response.status).toBe(503);
          await response.text();
        }
      } catch { expect(abort.signal.aborted).toBe(true); }
    });
    expect(fetch).toHaveBeenCalledTimes(phase === 0 ? 8 : 9);
  }
});
