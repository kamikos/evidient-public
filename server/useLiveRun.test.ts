import { afterEach, expect, it, vi } from 'vitest';
import { evidence } from './generated/evidence';
const { fetch, setters } = vi.hoisted(() => ({ fetch: vi.fn(), setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock('expo/fetch', () => ({ fetch }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn, useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => { const setter = vi.fn(); setters.push(setter); return [value, setter]; },
}));
import { useLiveRun } from '../ui/useLiveRun';
afterEach(() => { fetch.mockReset(); setters.length = 0; });
const sse = (...events: unknown[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
it('chains checkpoints using JSON POST and delivers a single combined timed trace', async () => {
  const record = evidence.alcohol__lorazepam;
  if (!record) throw new Error('Missing fixture');
  const card = record.card;
  fetch.mockResolvedValueOnce(sse({ type: 'thinking', text: 'first', t: 12 }, { type: 'checkpoint', next: '/api/continue', state: 'opaque' }))
    .mockResolvedValueOnce(sse({ type: 'card_ready', card, t: 250 }));
  const onCard = vi.fn();
  const run = useLiveRun('alcohol__lorazepam', onCard);
  await run.start({ inject: false });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]).toMatchObject(['/api/continue', { method: 'POST', body: '{"state":"opaque"}', headers: { accept: 'text/event-stream' } }]);
  expect(onCard).toHaveBeenCalledOnce();
  expect(onCard.mock.calls[0][1].map((event: { t: number }) => event.t)).toEqual([12, 250]);
});
it('reports continuation HTTP failures clearly', async () => {
  fetch.mockResolvedValueOnce(sse({ type: 'checkpoint', next: '/api/continue', state: 'opaque' }))
    .mockResolvedValueOnce(Response.json({ error: 'Expired state' }, { status: 400 }));
  await useLiveRun('alcohol__lorazepam').start({ inject: false });
  expect(setters[3]).toHaveBeenLastCalledWith('The live run could not continue (HTTP 400). Expired state');
});
it('aborts the active phase when stopped and starts no continuation', async () => {
  let release: (response: Response) => void = () => {};
  fetch.mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
  const run = useLiveRun('alcohol__lorazepam');
  const done = run.start({ inject: false });
  run.stop();
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  release(sse({ type: 'checkpoint', next: '/api/continue', state: 'opaque' }));
  await done;
  expect(fetch).toHaveBeenCalledOnce();
});
