import { catalog } from '../../server/generated/catalog';

export function GET() {
  return Response.json(catalog, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
