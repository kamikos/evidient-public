import type { EdgeCard, PairKey } from '../shared/contract';
type Cache = Map<PairKey, { card: EdgeCard; expires: number }>;
declare global { var evidientRequestedCache: Cache | undefined; }
export const requestedCache = globalThis.evidientRequestedCache ??= new Map();
export function cacheRequestedCard(card: EdgeCard) {
  if (requestedCache.size >= 120) requestedCache.delete(requestedCache.keys().next().value!);
  requestedCache.set(card.pair, { card, expires: Date.now() + 86_400_000 });
}
