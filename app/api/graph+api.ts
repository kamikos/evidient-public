import { getGraph } from '../../server/catalog';

export function GET(request: Request) {
  return Response.json(getGraph((new URL(request.url).searchParams.get('ids') ?? '').split(',').map(id => id.trim())));
}
