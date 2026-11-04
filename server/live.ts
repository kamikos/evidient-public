import type { Journal } from './checkpoint';
export function newJournal(request: Request): Journal {
  const url = new URL(request.url);
  return { version: 1, id: crypto.randomUUID(), started: Date.now(), path: url.pathname + url.search, phase: 1, entries: [], events: {}, usageCalls: 0, spendUSD: 0 };
}
