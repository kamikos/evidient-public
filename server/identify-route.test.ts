import { expect, it, vi } from 'vitest';
import { POST } from '../app/api/identify+api';
vi.mock('./identify', () => ({ identify: vi.fn(async () => { throw new Error('Image identification returned invalid structured output after two attempts.'); }) }));
it('returns clear 502 JSON when image output is invalid after retry', async () => {
  const response = await POST(new Request('http://localhost/api/identify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageBase64: 'AAAA', mimeType: 'image/png' }) }));
  expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: 'Image identification returned invalid structured output after two attempts.' });
});
