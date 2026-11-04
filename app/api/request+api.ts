import { newJournal } from '../../server/live';
import { edges } from '../../data/edges';
import type { PairKey } from '../../shared/contract';
import { resolveRequested, runRequestedPair } from '../../server/agent/request';
import { checkLiveAccess } from '../../server/limits';
import { streamEvidence } from '../../server/sse';

import { requestedCache as cache, cacheRequestedCard } from '../../server/requestCache';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const a = url.searchParams.get('a') ?? '';
  const b = url.searchParams.get('b') ?? '';
  if (!a || !b || a === b) return Response.json({ error: 'Choose two different substance IDs' }, { status: 400 });
  try { resolveRequested(a); resolveRequested(b); }
  catch { return Response.json({ error: 'Unknown substance ID' }, { status: 400 }); }
  const [first, second] = [a, b].sort();
  const pair: PairKey = `${first}__${second}`;
  if (edges.some(edge => edge.pair === pair)) return Response.json({ error: 'This pair has curated evidence', pair }, { status: 409 });
  for (const [key, entry] of cache) if (entry.expires <= Date.now()) cache.delete(key);
  if (url.searchParams.get('cached') === '1') {
    const entry = cache.get(pair);
    return entry ? Response.json(entry.card, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'No cached requested review' }, { status: 404 });
  }
  const denied = checkLiveAccess(request, 'live');
  if (denied) return denied;
  return streamEvidence(request, options => runRequestedPair(a, b, { ...options, onEvent: event => {
    if (event.type === 'card_ready') {
      cacheRequestedCard(event.card);
    }
    options.onEvent?.(event);
  } }), newJournal(request));
}
