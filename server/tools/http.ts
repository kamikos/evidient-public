import type { RunContext } from '../runContext';
import { externalFetch, RequestBudgetError } from '../requests';
export async function fetchJson(url: URL | string, signal?: AbortSignal, context?: RunContext): Promise<unknown> {
  const response = await externalFetch(url.toString(), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) }, context);
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Source HTTP ${response.status}`); }
  return response.json();
}
