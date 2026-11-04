import { batchIndex } from '../../server/generated/batch';
export function GET() {
  return Response.json({ rows: batchIndex }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
