import { searchSubstances } from '../../server/catalog';

export function GET(request: Request) {
  return Response.json(searchSubstances(new URL(request.url).searchParams.get('q') ?? ''));
}
