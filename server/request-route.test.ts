import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '../app/api/request+api';
import { GET as evidenceGET } from '../app/api/evidence/[pair]+api';
import { runRequestedPair } from './agent/request';
import { runEdge } from './agent/run';
import { POST as continuePOST } from '../app/api/continue+api';
import { signJournal } from './checkpoint';
import { newJournal } from './live';
vi.mock('./agent/request', async original => ({ ...await original<typeof import('./agent/request')>(), runRequestedPair: vi.fn() }));
vi.mock('./agent/run', async original => ({ ...await original<typeof import('./agent/run')>(), runEdge: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const req = (query: string, ip = '192.0.2.80') => new Request(`http://localhost/api/request?${query}`, { headers: { 'cf-connecting-ip': ip } });
it('validates IDs, rejects curated pairs in either order, and returns cache misses without spending quota', async () => {
  expect((await GET(req('a=unknown&b=alcohol'))).status).toBe(400);
  expect((await GET(req('a=ibuprofen&b=ibuprofen'))).status).toBe(400);
  const response = await GET(req('a=metronidazole&b=alcohol'));
  expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ pair: 'alcohol__metronidazole' });
  expect((await GET(req('a=levothyroxine&b=alcohol&cached=1'))).status).toBe(404);
  expect(runRequestedPair).not.toHaveBeenCalled();
});
it('shares the live-run limiter bucket with curated reviews and respects LIVE_RUNS', async () => {
  vi.stubEnv('LIVE_RUNS', 'off');
  expect((await GET(req('a=levothyroxine&b=alcohol', '192.0.2.81'))).status).toBe(503);
  vi.stubEnv('LIVE_RUNS', 'on');
  vi.mocked(runRequestedPair).mockRejectedValue(new Error('fake'));
  vi.mocked(runEdge).mockRejectedValue(new Error('fake'));
  const options = { headers: { 'cf-connecting-ip': '192.0.2.81' } };
  await (await evidenceGET(new Request('http://localhost/api/evidence/alcohol__metronidazole?live=1', options), { pair: 'alcohol__metronidazole' })).text();
  for (let i = 0; i < 2; i++) await (await GET(req('a=levothyroxine&b=alcohol', '192.0.2.81'))).text();
  const denied = await GET(req('a=levothyroxine&b=alcohol', '192.0.2.81'));
  expect(denied.status).toBe(429); expect(denied.headers.get('retry-after')).toBeTruthy();
});
it('frames SSE, sends heartbeats and aborts requested research on cancellation', async () => {
  vi.stubEnv('LIVE_RUNS', 'on'); vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.mocked(runRequestedPair).mockImplementation(async (_a, _b, options) => {
    signal = options?.signal;
    options?.onEvent?.({ type: 'thinking', text: 'Reading labels.' });
    return new Promise(() => {});
  });
  const response = await GET(req('a=levothyroxine&b=alcohol', '192.0.2.82'));
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: {"type":"thinking","text":"Reading labels.","t":0}\n\n');
  await vi.advanceTimersByTimeAsync(10000);
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(': heartbeat\n\n');
  await reader.cancel(); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});

it('caches finished requested cards in either order and expires them after 24 hours', async () => {
  vi.stubEnv('LIVE_RUNS', 'on'); vi.useFakeTimers();
  const { evidence } = await import('./generated/evidence');
  const template = evidence['alcohol__metronidazole']!.card;
  const card = { ...template, pair: 'alcohol__levothyroxine' as const, a: 'alcohol', b: 'levothyroxine', origin: 'requested' as const };
  vi.mocked(runRequestedPair).mockImplementation(async (_a, _b, options) => {
    options?.onEvent?.({ type: 'card_ready', card });
    return { card, trace: [] };
  });
  const response = await GET(req('a=levothyroxine&b=alcohol', '192.0.2.83'));
  expect(await response.text()).toContain('"type":"card_ready"');
  const cached = await GET(req('a=alcohol&b=levothyroxine&cached=1'));
  expect(await cached.json()).toEqual(card);
  vi.advanceTimersByTime(86_400_001);
  expect((await GET(req('a=alcohol&b=levothyroxine&cached=1'))).status).toBe(404);
});

it('caches a requested card completed by a signed continuation without consuming live quota', async () => {
  vi.stubEnv('MODEL_API_KEY', 'test-key'); vi.stubEnv('LIVE_RUNS', 'off');
  const { evidence } = await import('./generated/evidence');
  const template = evidence['alcohol__metronidazole']!.card;
  const card = { ...template, pair: 'ibuprofen__lisinopril' as const, a: 'ibuprofen', b: 'lisinopril', origin: 'requested' as const };
  vi.mocked(runRequestedPair).mockImplementation(async (_a, _b, options) => {
    options?.onEvent?.({ type: 'card_ready', card }); return { card, trace: [] };
  });
  const state = await signJournal(newJournal(req('a=ibuprofen&b=lisinopril')));
  const response = await continuePOST(new Request('http://localhost/api/continue', { method: 'POST', body: JSON.stringify({ state }) }));
  expect(await response.text()).toContain('"type":"card_ready"');
  expect(await (await GET(req('a=lisinopril&b=ibuprofen&cached=1'))).json()).toEqual(card);
});
