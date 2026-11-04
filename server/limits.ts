import { liveRunsEnabled } from './env';

type Action = 'live' | 'identify';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const LIVE_OFF_MESSAGE = 'Live runs are turned off on this demo. Cached evidence still works.';

// Best-effort protection per worker isolate. Entries expire after one hour.
export function createLimiter(now: () => number = Date.now) {
  const clients = new Map<string, { count: number; reset: number }>();
  let daily = { count: 0, reset: 0 };
  return (request: Request, action: Action): Response | undefined => {
    if (!liveRunsEnabled()) return Response.json({ error: LIVE_OFF_MESSAGE }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const time = now();
    for (const [key, entry] of clients) if (entry.reset <= time) clients.delete(key);
    if (daily.reset <= time) daily = { count: 0, reset: time + DAY };
    const ip = request.headers.get('cf-connecting-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const key = `${action}:${ip}`;
    const entry = clients.get(key) ?? { count: 0, reset: time + HOUR };
    const reject = (reset: number, error: string) => Response.json({ error }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((reset - time) / 1000))), 'Cache-Control': 'no-store' } });
    if (action === 'live' && daily.count >= 60) return reject(daily.reset, 'This demo has reached its daily live-run limit. Please use cached evidence or try again tomorrow.');
    if (entry.count >= (action === 'live' ? 3 : 12)) return reject(entry.reset, 'Too many requests. Please use cached evidence or try again after the limit resets.');
    entry.count++;
    clients.set(key, entry);
    if (action === 'live') daily.count++;
  };
}
// Expo bundles each API route separately. Keep the bucket on the isolate global
// so /request and /evidence cannot acquire independent quotas.
declare global { var evidientLiveLimiter: ReturnType<typeof createLimiter> | undefined; }
export const checkLiveAccess = globalThis.evidientLiveLimiter ??= createLimiter();
