import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { getEnv } from './env';

// Replaying recorded responses rebuilds source text, claims and model continuation
// inputs without network calls. Occurrence numbers preserve distinct retry attempts.
const entrySchema = z.object({ key: z.string(), status: z.number(), headers: z.array(z.tuple([z.string(), z.string()])), body: z.string(), error: z.string().optional() });
export const journalSchema = z.object({
  version: z.literal(1), id: z.string(), started: z.number(), path: z.string(), phase: z.number(),
  entries: z.array(entrySchema), events: z.record(z.string(), z.number()), usageCalls: z.number(), spendUSD: z.number(),
});
export type Journal = z.infer<typeof journalSchema>;
export const INVOCATION_FETCH_BUDGET = 8;
export class CheckpointReached extends Error {}
type Scope = { journal: Journal; count: number; cursor: Map<string, number>; usageCursor: number; tail: Promise<unknown>; abort: AbortController };
const scope = new AsyncLocalStorage<Scope>();
export function withJournal<T>(journal: Journal, abort: AbortController, work: () => Promise<T>) {
  return scope.run({ journal, abort, count: 0, cursor: new Map(), usageCursor: 0, tail: Promise.resolve() }, work);
}
export function chargeUsage(usd = 0) {
  const current = scope.getStore();
  if (!current) return true;
  const ordinal = ++current.usageCursor;
  if (ordinal <= current.journal.usageCalls) return false;
  current.journal.usageCalls = ordinal;
  current.journal.spendUSD += usd;
  return true;
}
export function phaseCount() { return scope.getStore()?.count ?? 0; }
export async function journalFetch(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1], work: () => Promise<Response>): Promise<Response> {
  const current = scope.getStore();
  if (!current) return work();
  const request = new Request(input, init);
  // Never include authorization headers or API keys in the client-held journal.
  const signature = `${request.method}:${request.url}:${await request.text()}`;
  const hash = bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature))));
  const occurrence = current.cursor.get(hash) ?? 0;
  current.cursor.set(hash, occurrence + 1);
  const key = `${hash}:${occurrence}`;
  const task = current.tail.then(async () => {
    current.abort.signal.throwIfAborted();
    const cached = current.journal.entries.find(entry => entry.key === key);
    if (cached) {
      if (cached.error) throw new Error(cached.error);
      return new Response(cached.body || null, { status: cached.status, headers: cached.headers });
    }
    if (current.count >= INVOCATION_FETCH_BUDGET) {
      const error = new CheckpointReached();
      current.abort.abort(error);
      throw error;
    }
    current.count++;
    const cap = Number(process.env.MAX_INVOCATION_FETCHES ?? Infinity);
    if (current.count > cap) throw new Error('Too many subrequests by single Worker invocation');
    try {
      const response = await work();
      const body = await response.text();
      const headers = [...response.headers.entries()].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(name));
      current.journal.entries.push({ key, status: response.status, headers, body });
      return new Response(body || null, { status: response.status, headers });
    } catch (error) {
      current.abort.signal.throwIfAborted();
      current.journal.entries.push({ key, status: 500, headers: [], body: '', error: error instanceof Error ? error.message : 'Fetch failed' });
      throw error;
    }
  });
  current.tail = task.catch(() => {});
  return task;
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64ToBytes(text: string) { return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)); }
async function signingKey() {
  const secret = getEnv().modelApiKey;
  if (!secret) throw new Error('MODEL_API_KEY is not configured');
  const key = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`evidient-state-v1:${secret}`));
  return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signJournal(journal: Journal) {
  const bytes = new TextEncoder().encode(JSON.stringify(journal));
  const compressed = bytes.length > 200_000;
  const payload = compressed ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()) : bytes;
  const message = `${compressed ? 'gz' : 'json'}.${bytesToBase64(payload)}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(message));
  return `${message}.${bytesToBase64(new Uint8Array(signature))}`;
}
export async function readJournal(token: string): Promise<Journal> {
  if (token.length > 12_000_000) throw new Error('State too large');
  const [format, payload, signature, extra] = token.split('.');
  if (extra || !payload || !signature || !['gz', 'json'].includes(format)) throw new Error('Invalid state');
  if (!await crypto.subtle.verify('HMAC', await signingKey(), base64ToBytes(signature), new TextEncoder().encode(`${format}.${payload}`))) throw new Error('Invalid state signature');
  const bytes = base64ToBytes(payload);
  const text = format === 'gz' ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes);
  const journal = journalSchema.parse(JSON.parse(text));
  if (Date.now() - journal.started > 600_000 || journal.started > Date.now() + 5000) throw new Error('Expired state');
  return journal;
}
