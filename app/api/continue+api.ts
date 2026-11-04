import { readJournal } from '../../server/checkpoint';
import { streamEvidence } from '../../server/sse';
import { runEdge } from '../../server/agent/run';
import { runRequestedPair } from '../../server/agent/request';
import { cacheRequestedCard } from '../../server/requestCache';
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('state' in body) || typeof body.state !== 'string') throw new Error('Missing state');
    const journal = await readJournal(body.state);
    const url = new URL(journal.path, 'https://evidient.invalid');
    if (url.pathname === '/api/request') {
      const a = url.searchParams.get('a'); const b = url.searchParams.get('b');
      if (!a || !b) throw new Error('Invalid requested pair');
      return streamEvidence(request, options => runRequestedPair(a, b, { ...options, onEvent: event => {
        if (event.type === 'card_ready') cacheRequestedCard(event.card);
        options.onEvent?.(event);
      } }), journal);
    }
    const match = /^\/api\/evidence\/([a-z0-9_-]+)$/.exec(url.pathname);
    if (!match) throw new Error('Invalid continuation route');
    return streamEvidence(request, options => runEdge(match[1], { ...options, inject: url.searchParams.get('inject') === '1' }), journal);
  } catch {
    return Response.json({ error: 'Invalid or expired live-run state. Start a new run.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
