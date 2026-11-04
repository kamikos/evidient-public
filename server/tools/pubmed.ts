import type { RunContext } from '../runContext';
import { externalFetch, RequestBudgetError } from '../requests';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
// Reserve timestamps only; no isolate-global promise can belong to another Worker request.
let nextRequest = 0;
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
async function throttle(signal?: AbortSignal) {
  const now = Date.now();
  const scheduled = Math.max(now, nextRequest);
  nextRequest = scheduled + (process.env.NCBI_API_KEY?.trim() ? 100 : 350);
  if (scheduled > now) await delay(scheduled - now, signal);
}
function endpoint(action: string, params: Record<string, string>) {
  const url = new URL(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${action}.fcgi`);
  const key = process.env.NCBI_API_KEY?.trim();
  url.search = new URLSearchParams({ db: 'pubmed', tool: 'evidient', ...params, ...(key ? { api_key: key } : {}) }).toString();
  return url;
}
async function requestText(url: URL, signal?: AbortSignal, context?: RunContext): Promise<string> {
  const backoff = [600, 1500, 3000];
  for (let attempt = 0; ; attempt++) {
    await throttle(signal);
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await externalFetch(url.toString(), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) }, context);
      if (response.ok) return await response.text();
    } catch (error) {
      if (error instanceof RequestBudgetError) throw error;
      signal?.throwIfAborted();
      if (attempt >= backoff.length) throw new Error('PubMed network request failed');
      await delay(backoff[attempt], signal);
      continue;
    }
    const retryAfter = response.headers.get('Retry-After');
    await response.body?.cancel();
    if (attempt >= backoff.length || (response.status !== 429 && response.status < 500)) throw new Error(`PubMed HTTP ${response.status}`);
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const retryMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? '') - Date.now();
    await delay(Math.max(backoff[attempt], Number.isFinite(retryMs) ? retryMs : 0), signal);
  }
}

export async function search(query: string, max = 10, signal?: AbortSignal, context?: RunContext): Promise<string[]> {
  const data: unknown = JSON.parse(await requestText(endpoint('esearch', { term: query, retmax: String(Math.min(100, Math.max(1, Math.trunc(max)))), retmode: 'json' }), signal, context));
  return z.object({ esearchresult: z.object({ idlist: z.array(z.string()) }) }).parse(data).esearchresult.idlist;
}

export interface PubmedAbstract {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  abstractText: string;
  publicationTypes: string[];
  firstAuthor?: string;
}
function textOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, digits: string) => {
    const code = digits.toLowerCase().startsWith('x') ? parseInt(digits.slice(1), 16) : Number(digits);
    return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  });
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => !key.startsWith('@_')).map(([, child]) => textOf(child)).join(' ');
  return '';
}
const articleSchema = z.object({ MedlineCitation: z.object({
  PMID: z.unknown(), Article: z.object({
    ArticleTitle: z.unknown(), Journal: z.object({ Title: z.unknown(), JournalIssue: z.object({ PubDate: z.unknown() }) }),
    Abstract: z.object({ AbstractText: z.array(z.unknown()) }).optional(),
    PublicationTypeList: z.object({ PublicationType: z.array(z.unknown()) }).optional(),
    AuthorList: z.object({ Author: z.array(z.object({ LastName: z.string().optional(), CollectiveName: z.string().optional() })) }).optional(),
  }),
}) });

export async function fetchAbstracts(pmids: string[], signal?: AbortSignal, context?: RunContext): Promise<PubmedAbstract[]> {
  if (!pmids.length) return [];
  if (pmids.length > 100 || pmids.some(id => !/^\d+$/.test(id))) throw new Error('Invalid PMID list');
  const xml = await requestText(endpoint('efetch', { id: pmids.join(','), retmode: 'xml' }), signal, context);
  const parsed: unknown = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false, isArray: tag => ['PubmedArticle', 'AbstractText', 'PublicationType', 'Author'].includes(tag) }).parse(xml);
  const root = z.object({ PubmedArticleSet: z.object({ PubmedArticle: z.array(articleSchema).optional() }) }).parse(parsed);
  return (root.PubmedArticleSet.PubmedArticle ?? []).map(({ MedlineCitation: citation }) => {
    const article = citation.Article;
    return {
      pmid: textOf(citation.PMID), title: textOf(article.ArticleTitle), journal: textOf(article.Journal.Title),
      year: textOf(article.Journal.JournalIssue.PubDate).match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '',
      abstractText: (article.Abstract?.AbstractText ?? []).map(textOf).join('\n\n'),
      publicationTypes: (article.PublicationTypeList?.PublicationType ?? []).map(textOf),
      firstAuthor: textOf(article.AuthorList?.Author[0]?.LastName ?? article.AuthorList?.Author[0]?.CollectiveName),
    };
  });
}
