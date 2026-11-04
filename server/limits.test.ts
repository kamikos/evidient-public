import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLimiter, LIVE_OFF_MESSAGE } from './limits';
import { liveRunsEnabled } from './env';

afterEach(() => vi.unstubAllEnvs());
const request = (ip = '192.0.2.1') => new Request('http://localhost/api', { headers: { 'cf-connecting-ip': ip } });
describe('public demo protection', () => {
  it('defaults on in development and off in production, and honors explicit settings', () => {
    vi.stubEnv('LIVE_RUNS', undefined);
    vi.stubEnv('NODE_ENV', 'development'); expect(liveRunsEnabled()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production'); expect(liveRunsEnabled()).toBe(false);
    vi.stubEnv('LIVE_RUNS', 'on'); expect(liveRunsEnabled()).toBe(true);
    vi.stubEnv('LIVE_RUNS', 'invalid'); expect(liveRunsEnabled()).toBe(false);
  });
  it('blocks both paid endpoints before consuming quota when disabled', async () => {
    const limit = createLimiter();
    vi.stubEnv('LIVE_RUNS', 'off');
    for (const action of ['live', 'identify'] as const) {
      const response = limit(request(), action);
      expect(response?.status).toBe(503);
      expect(await response?.json()).toEqual({ error: LIVE_OFF_MESSAGE });
    }
    vi.stubEnv('LIVE_RUNS', 'on');
    for (let i = 0; i < 3; i++) expect(limit(request(), 'live')).toBeUndefined();
  });
  it('enforces separate hourly quotas, IP precedence, Retry-After, and window expiry', () => {
    vi.stubEnv('LIVE_RUNS', 'on');
    let time = 0;
    const limit = createLimiter(() => time);
    for (let i = 0; i < 3; i++) expect(limit(request(), 'live')).toBeUndefined();
    expect(limit(request(), 'live')?.status).toBe(429);
    expect(limit(request(), 'live')?.headers.get('Retry-After')).toBe('3600');
    for (let i = 0; i < 12; i++) expect(limit(request(), 'identify')).toBeUndefined();
    expect(limit(request(), 'identify')?.status).toBe(429);
    expect(limit(request('192.0.2.2'), 'live')).toBeUndefined();
    const forwarded = new Request('http://localhost', { headers: { 'x-forwarded-for': '192.0.2.1, proxy' } });
    expect(limit(forwarded, 'live')?.status).toBe(429);
    time = 3_600_000;
    expect(limit(request(), 'live')).toBeUndefined();
  });
  it('caps live runs globally at 60 per day and resets without blocking identify', () => {
    vi.stubEnv('LIVE_RUNS', 'on');
    let time = 0;
    const limit = createLimiter(() => time);
    for (let i = 0; i < 60; i++) expect(limit(request(`ip-${i}`), 'live')).toBeUndefined();
    const response = limit(request('new-ip'), 'live');
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('86400');
    expect(limit(request(), 'identify')).toBeUndefined();
    time = 86_400_000;
    expect(limit(request(), 'live')).toBeUndefined();
  });
});
