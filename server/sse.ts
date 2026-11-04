import type { TraceEvent } from '../shared/contract';
import type { RunOptions, RunStage } from './agent/run';
import { CheckpointReached, signJournal, withJournal, phaseCount, type Journal } from './checkpoint';
export function streamEvidence(request: Request, run: (options: RunOptions) => Promise<unknown>, journal?: Journal) {
  const abort = new AbortController();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let stage: RunStage = 'research';
  let disconnect: () => void = () => {};
  const seen = new Map<string, number>();
  const cleanup = () => { clearInterval(timer); request.signal.removeEventListener('abort', disconnect); };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => { if (!stopped) { stopped = true; cleanup(); controller.close(); } };
      disconnect = () => { abort.abort(); close(); };
      request.signal.addEventListener('abort', disconnect, { once: true });
      if (request.signal.aborted) { disconnect(); return; }
      timer = setInterval(() => { if (!stopped) controller.enqueue(encoder.encode(': heartbeat\n\n')); }, 10_000);
      const onEvent = (event: TraceEvent) => {
        if (stopped) return;
        if (abort.signal.reason instanceof CheckpointReached) return;
        if (journal && event.type !== 'checkpoint') {
          const key = JSON.stringify(event);
          const count = (seen.get(key) ?? 0) + 1;
          seen.set(key, count);
          if (count <= (journal.events[key] ?? 0)) return;
          journal.events[key] = count;
        }
        if (journal && (event.type === 'card_ready' || event.type === 'error')) controller.enqueue(encoder.encode(`: phase ${journal.phase} fetches ${phaseCount()}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, ...(journal ? { t: Date.now() - journal.started } : {}) })}\n\n`));
        if (event.type === 'card_ready' || event.type === 'error' || event.type === 'checkpoint') close();
      };
      const work = async () => {
        try {
          await run({ memoryLedger: true, skipChallenge: !!journal, started: journal?.started, onEvent, signal: abort.signal, onStage: next => { stage = next; } });
        } finally {
          if (journal && !stopped) {
            const count = phaseCount();
            controller.enqueue(encoder.encode(`: phase ${journal.phase} fetches ${count}\n\n`));
          }
        }
      };
      void (journal ? withJournal(journal, abort, work) : work()).catch(async () => {
        if (journal && abort.signal.reason instanceof CheckpointReached && !stopped) {
          journal.phase++;
          // All fetch bodies have settled before the signed journal leaves this invocation.
          const state = await signJournal(journal);
          if (stopped) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'checkpoint', next: '/api/continue', state, t: Date.now() - journal.started })}\n\n`));
          close();
          return;
        }
        if (!stopped) onEvent({ type: 'error', message: `Evidence generation failed during ${stage}. Please retry.`, recoverable: true });
      }).finally(close);
    },
    cancel() { stopped = true; abort.abort(); cleanup(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
