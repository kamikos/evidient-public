import { newJournal } from '../../../server/live';
import { evidence } from '../../../server/generated/evidence';
import { batchEvidence } from '../../../server/generated/batch';
import { streamEvidence } from '../../../server/sse';
import { checkLiveAccess } from '../../../server/limits';
import { edges } from '../../../data/edges';
import { runEdge } from '../../../server/agent/run';
export async function GET(request: Request, params: { pair: string }) {
  const pair = params.pair;
  if (!edges.some(edge => edge.pair === pair)) {
    const built = batchEvidence[pair];
    return built ? Response.json(built, { headers: { 'Cache-Control': 'public, max-age=300' } })
      : Response.json({ error: 'Unknown pair' }, { status: 404 });
  }
  const url = new URL(request.url);
  const inject = url.searchParams.get('inject') === '1';
  if (inject && pair !== 'alcohol__metronidazole') return Response.json({ error: 'Inject mode is available only for alcohol__metronidazole' }, { status: 400 });
  if (url.searchParams.get('live') !== '1') {
    const record = evidence[`${pair}${inject ? '.inject' : ''}`];
    return record ? Response.json(record, { headers: { 'Cache-Control': 'public, max-age=300' } })
      : Response.json({ error: 'Evidence has not been precomputed for this pair' }, { status: 404 });
  }
  const denied = checkLiveAccess(request, 'live');
  if (denied) return denied;
  return streamEvidence(request, options => runEdge(pair, { ...options, inject }), newJournal(request));
}
