import { journalFetch } from './checkpoint';
import type { RunContext } from './runContext';
export class RequestBudgetError extends Error { constructor() { super('External request budget reached'); } }
export function requestCount(context?: RunContext) { return context?.requests?.count ?? 0; }
export function researchBudgetReached(context?: RunContext) {
  const state = context?.requests;
  return !!state && state.count >= Math.max(0, state.max - 10);
}
// Bound abandoned bodies too, even when a caller supplied no abort signal.
export const BODY_IDLE_TIMEOUT_MS = 120_000;
export const externalFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1], context?: RunContext): Promise<Response> => {
  const state = context?.requests;
  if (!state) return journalFetch(input, init, () => fetch(input, init));
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  signal?.throwIfAborted();
  if (state.active >= 4) await new Promise<void>((resolve, reject) => {
    const resume = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const abort = () => {
      const index = state.queue.indexOf(resume);
      if (index >= 0) state.queue.splice(index, 1);
      reject(signal?.reason);
    };
    state.queue.push(resume);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  else state.active++;
  let released = false;
  let cleanup = () => {};
  const release = () => {
    if (released) return;
    released = true;
    cleanup();
    const next = state.queue.shift();
    if (next) next(); else state.active--;
  };
  try {
    signal?.throwIfAborted();
    if (state.count >= state.max || context?.research && researchBudgetReached(context)) throw new RequestBudgetError();
    state.count++;
    const response = await journalFetch(input, init, () => {
      const count = ++state.invocationCount;
      if (count > Number(process.env.MAX_INVOCATION_FETCHES ?? Infinity)) throw new Error('Too many subrequests by single Worker invocation');
      return fetch(input, init);
    });
    if (!response.body) { release(); return response; }
    const reader = response.body.getReader();
    let timer: ReturnType<typeof setTimeout>;
    let output: ReadableStreamDefaultController<Uint8Array>;
    const stop = (reason: unknown) => {
      if (released) return;
      // Cancel before handing the connection slot to the next request.
      void reader.cancel(reason).catch(() => {});
      output.error(reason);
      release();
    };
    const abort = () => stop(signal?.reason);
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stop(new DOMException('Response body idle timeout', 'TimeoutError')), BODY_IDLE_TIMEOUT_MS);
    };
    cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const body = new ReadableStream<Uint8Array>({
      start(controller) { output = controller; resetTimer(); },
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (released) return;
          if (chunk.done) { release(); controller.close(); }
          else { resetTimer(); controller.enqueue(chunk.value); }
        } catch (error) { if (!released) { release(); controller.error(error); } }
      },
      async cancel(reason) {
        const cancelled = reader.cancel(reason);
        release();
        await cancelled;
      },
    }, { highWaterMark: 0 });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    // Fetch has already decoded the upstream body in Node/workerd. A new Response
    // must not describe those decoded bytes using the upstream wire metadata.
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    headers.delete('transfer-encoding');
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) { release(); throw error; }
};
