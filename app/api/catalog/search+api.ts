import { searchCatalog } from '../../../server/catalog-search';

export function GET(request: Request) {
  return Response.json(searchCatalog(new URL(request.url).searchParams.get('q') ?? ''));
}
