import { afterEach, expect, it, vi } from 'vitest';
import { getMetaClient, modelTimeoutMs } from './meta';
afterEach(() => vi.unstubAllEnvs());
it('defaults model timeout to 120s, accepts an env override and leaves retries to the caller', () => {
  vi.stubEnv('MODEL_API_KEY', 'fake-test-key'); vi.stubEnv('MODEL_API_TIMEOUT_MS', '120000');
  expect(getMetaClient().timeout).toBe(120_000); expect(getMetaClient().maxRetries).toBe(0);
  vi.stubEnv('MODEL_API_TIMEOUT_MS', '90000'); expect(getMetaClient().timeout).toBe(90_000);
  vi.stubEnv('MODEL_API_TIMEOUT_MS', 'NaN'); expect(modelTimeoutMs).toThrow('positive number');
});
