import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { BODY_IDLE_TIMEOUT_MS, externalFetch } from './requests';
import { createRunContext } from './runContext';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('reads a real gzip upstream with decoded-body headers and preserves status metadata', async () => {
  const bytes = gzipSync(JSON.stringify({ ok: true }));
  const server = createServer((_request, response) => {
    response.writeHead(201, { 'Content-Encoding': 'gzip', 'Content-Length': bytes.length, 'Content-Type': 'application/json', 'X-Probe': 'kept' });
    response.end(bytes);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener');
    const context = createRunContext();
    const response = await externalFetch(`http://127.0.0.1:${address.port}`, undefined, context);
    expect(response.status).toBe(201);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('x-probe')).toBe('kept');
    expect(await response.json()).toEqual({ ok: true });
    expect(context.requests.active).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
it('cancels a never-read body and unblocks a waiter when the idle lease expires', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new ReadableStream({ cancel })));
  const context = createRunContext();
  const held = await Promise.all(Array.from({ length: 4 }, () => externalFetch('https://fake', undefined, context)));
  const next = externalFetch('https://fake', undefined, context);
  expect(context.requests.queue).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(BODY_IDLE_TIMEOUT_MS);
  const response = await next;
  expect(cancel).toHaveBeenCalledTimes(4);
  expect(context.requests.active).toBe(1);
  await expect(held[0].text()).rejects.toThrow('idle timeout');
  await response.body?.cancel();
  expect(context.requests.active).toBe(0);
});
it('aborts an unread body immediately and removes aborted queue entries', async () => {
  const cancel = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new ReadableStream({ cancel })));
  const context = createRunContext();
  const controller = new AbortController();
  const first = await externalFetch('https://fake', { signal: controller.signal }, context);
  const rest = await Promise.all(Array.from({ length: 3 }, () => externalFetch('https://fake', undefined, context)));
  const queued = new AbortController();
  const waiting = externalFetch(new Request('https://fake', { signal: queued.signal }), undefined, context);
  const rejection = expect(waiting).rejects.toThrow('queued abort');
  queued.abort(new Error('queued abort'));
  await rejection;
  expect(context.requests.queue).toHaveLength(0);
  expect(context.requests.count).toBe(4);
  controller.abort(new Error('body abort'));
  expect(context.requests.active).toBe(3);
  expect(cancel).toHaveBeenCalledTimes(1);
  await expect(first.text()).rejects.toThrow('body abort');
  await Promise.all(rest.map(response => response.body?.cancel()));
  expect(context.requests.active).toBe(0);
});
it('releases exactly once on body errors, cancellation failures, fetch failures and budget rejection', async () => {
  const context = createRunContext(4);
  const upstream = vi.spyOn(globalThis, 'fetch');
  upstream.mockRejectedValueOnce(new Error('network'));
  await expect(externalFetch('https://fake', undefined, context)).rejects.toThrow('network');
  expect(context.requests.active).toBe(0);
  upstream.mockResolvedValueOnce(new Response(new ReadableStream({ pull(controller) { controller.error(new Error('body')); } })));
  await expect((await externalFetch('https://fake', undefined, context)).text()).rejects.toThrow('body');
  expect(context.requests.active).toBe(0);
  upstream.mockResolvedValueOnce(new Response(new ReadableStream({ cancel() { throw new Error('cancel'); } })));
  await expect((await externalFetch('https://fake', undefined, context)).body?.cancel()).rejects.toThrow('cancel');
  expect(context.requests.active).toBe(0);
  upstream.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await externalFetch('https://fake', undefined, context);
  await expect(externalFetch('https://fake', undefined, context)).rejects.toThrow('budget');
  expect(context.requests.active).toBe(0);
  expect(upstream).toHaveBeenCalledTimes(4);
});

it('supports SDK SSE iteration through completion and cancellation on early exit', async () => {
  const { getMetaClient } = await import('./meta');
  vi.stubEnv('MODEL_API_KEY', 'fake-key');
  const encoded = new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: [DONE]\n\n');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoded); controller.close(); },
  }), { headers: { 'content-type': 'text/event-stream', 'content-encoding': 'gzip', 'content-length': '999' } }));
  try {
    for (const earlyExit of [false, true]) {
      const context = createRunContext();
      const stream = await getMetaClient(context).responses.create({ model: 'muse-spark-1.3', input: 'OK', stream: true });
      const events = [];
      for await (const event of stream) {
        events.push(event.type);
        if (earlyExit) break;
      }
      expect(events).toEqual(['response.output_text.delta']);
      expect(context.requests.active).toBe(0);
    }
  } finally { vi.unstubAllEnvs(); }
});
