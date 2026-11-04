import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/api/evidence/[pair]+api';
import { POST } from '../app/api/identify+api';
import { runEdge } from './agent/run';
vi.mock('./agent/run', () => ({ runEdge: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
it('turns off both live routes while keeping cached evidence available', async () => {
  vi.stubEnv('LIVE_RUNS', 'off');
  const response = await GET(new Request('http://localhost/api/evidence/alcohol__metronidazole?live=1'), { pair: 'alcohol__metronidazole' });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Live runs are turned off on this demo. Cached evidence still works.' });
  expect((await POST(new Request('http://localhost/api/identify', { method: 'POST' }))).status).toBe(503);
  expect((await GET(new Request('http://localhost/api/evidence/alcohol__metronidazole'), { pair: 'alcohol__metronidazole' })).status).toBe(200);
  expect(runEdge).not.toHaveBeenCalled();
});
describe('evidence route', () => {
  it('validates the curated pair and serves the bundled injected cache', async () => {
    expect((await GET(new Request('http://localhost/api/evidence/unknown'), { pair: '../unknown' })).status).toBe(404);
    const response = await GET(new Request('http://localhost/api/evidence/alcohol__metronidazole?inject=1'), { pair: 'alcohol__metronidazole' });
    expect(response.status).toBe(200); expect(await response.json()).toHaveProperty('card');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });
  it('streams contract events and closes immediately after an error', async () => {
    vi.mocked(runEdge).mockImplementation(async (_pair, options) => {
      options?.onEvent?.({ type: 'thinking', text: 'Reading sources.' });
      options?.onEvent?.({ type: 'error', message: 'Fake test error', recoverable: true });
      throw new Error('Fake test error');
    });
    const response = await GET(new Request('http://localhost/api/evidence/alcohol__metronidazole?live=1&inject=1'), { pair: 'alcohol__metronidazole' });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await response.text();
    expect(text.split('data: ').length - 1).toBe(2); expect(text).toContain('Reading sources.');
    expect(vi.mocked(runEdge).mock.calls[0][1]?.inject).toBe(true);
  });
  it('sends heartbeats and aborts agent work on stream cancellation', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.mocked(runEdge).mockImplementation(async (_pair, options) => { signal = options?.signal; return new Promise(() => {}); });
    const response = await GET(new Request('http://localhost/api/evidence/alcohol__metronidazole?live=1'), { pair: 'alcohol__metronidazole' });
    const reader = response.body!.getReader();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await reader.read(); expect(new TextDecoder().decode(result.value)).toBe(': heartbeat\n\n');
    await reader.cancel(); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts agent work when the request disconnects', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(runEdge).mockImplementation(async (_pair, options) => { signal = options?.signal; return new Promise(() => {}); });
    const abort = new AbortController();
    const response = await GET(new Request('http://localhost/api/evidence/alcohol__metronidazole?live=1', { signal: abort.signal }), { pair: 'alcohol__metronidazole' });
    abort.abort(); expect(signal?.aborted).toBe(true); expect(await response.text()).toBe('');
  });
});
describe('identify request validation', () => {
  it('rejects invalid JSON, missing fields, unsupported MIME and oversized bodies before inference', async () => {
    const request = (body: string, headers = {}) => new Request('http://localhost/api/identify', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request('{}'))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ imageBase64: 'AAAA', mimeType: 'text/plain' })))).status).toBe(400);
    expect((await POST(request('{}', { 'content-length': String(6 * 1024 * 1024 + 1) }))).status).toBe(413);
    expect((await POST(request('x'.repeat(6 * 1024 * 1024 + 1)))).status).toBe(413);
    expect((await POST(new Request('http://localhost/api/identify', { method: 'POST', body: '{}' }))).status).toBe(415);
  });
});

it('route catch reports the last stage without exposing upstream details', async () => {
  vi.stubEnv('LIVE_RUNS', 'on');
  vi.mocked(runEdge).mockImplementation(async (_pair, options) => {
    options?.onStage?.('verification');
    throw new Error('secret API key and stack');
  });
  const response = await GET(new Request('http://localhost/api/evidence/alcohol__metronidazole?live=1', { headers: { 'cf-connecting-ip': '192.0.2.151' } }), { pair: 'alcohol__metronidazole' });
  const text = await response.text();
  expect(text).toContain('Evidence generation failed during verification. Please retry.');
  expect(text).not.toContain('secret');
});
