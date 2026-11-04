import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const ok = () => Response.json({ esearchresult: { idlist: ['123'] } });
it('retries 429, server and network failures, honoring Retry-After', async () => {
  const { search } = await import('./pubmed');
  const times: number[] = [];
  const responses = [new Response('', { status: 429, headers: { 'Retry-After': '2' } }), new Response('', { status: 503 })];
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    times.push(Date.now());
    if (times.length === 3) throw new TypeError('network');
    return responses.shift() ?? ok();
  });
  const pending = search('pair');
  await vi.runAllTimersAsync();
  expect(await pending).toEqual(['123']);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(times.slice(1).map((time, i) => time - times[i])).toEqual([2000, 1500, 3000]);
});
it('uses HTTP-date Retry-After and stops after three retries', async () => {
  const { search } = await import('./pubmed');
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': 'Tue, 03 Nov 2026 12:00:04 GMT' } }));
  const rejected = expect(search('pair')).rejects.toThrow('PubMed HTTP 429');
  await vi.runAllTimersAsync(); await rejected;
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('does not retry permanent errors or cancellation', async () => {
  const { search } = await import('./pubmed');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 400 }));
  await expect(search('pair')).rejects.toThrow('PubMed HTTP 400');
  expect(fetch).toHaveBeenCalledTimes(1);
  const controller = new AbortController(); controller.abort();
  await expect(search('pair', 5, controller.signal)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([[undefined, 350], ['test-key', 100]])('throttles concurrent requests with key %s', async (key, spacing) => {
  if (key) vi.stubEnv('NCBI_API_KEY', key); else vi.stubEnv('NCBI_API_KEY', '');
  const { search } = await import('./pubmed');
  const times: number[] = [];
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { times.push(Date.now()); return ok(); });
  const pending = Promise.all([search('a'), search('b'), search('c')]);
  await vi.runAllTimersAsync(); await pending;
  expect(times.slice(1).map((time, i) => time - times[i])).toEqual([spacing, spacing]);
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(url.searchParams.get('tool')).toBe('evidient');
  expect(url.searchParams.get('api_key')).toBe(key ?? null);
});
it('retries abstract fetching too', async () => {
  const { fetchAbstracts } = await import('./pubmed');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 502 })).mockResolvedValueOnce(new Response('<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>123</PMID><Article><ArticleTitle>Trial</ArticleTitle><Journal><Title>Journal</Title><JournalIssue><PubDate><Year>2023</Year></PubDate></JournalIssue></Journal><Abstract><AbstractText>Exact abstract text.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>'));
  const checked = fetchAbstracts(['123']);
  await vi.runAllTimersAsync();
  expect(await checked).toMatchObject([{ pmid: '123', abstractText: 'Exact abstract text.', year: '2023' }]);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('creates no timers at module import', async () => {
  await import('./pubmed');
  expect(vi.getTimerCount()).toBe(0);
});
it('cancels backoff without making another request', async () => {
  const { search } = await import('./pubmed');
  const controller = new AbortController();
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429 }));
  const rejected = expect(search('pair', 5, controller.signal)).rejects.toThrow('cancelled');
  await vi.advanceTimersByTimeAsync(100);
  controller.abort(new Error('cancelled'));
  await rejected;
  await vi.runAllTimersAsync();
  expect(fetch).toHaveBeenCalledTimes(1);
});
