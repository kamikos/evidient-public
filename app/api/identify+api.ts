import { z } from 'zod';
import { identify } from '../../server/identify';
import { withMemoryLedger } from '../../server/agent/runtime';
import { checkLiveAccess } from '../../server/limits';
const bodySchema = z.object({ imageBase64: z.string().min(4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']) }).strict();
const MAX_BODY = 6 * 1024 * 1024;
export async function POST(request: Request) {
  const denied = checkLiveAccess(request, 'identify');
  if (denied) return denied;
  if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Expected application/json' }, { status: 415 });
  if (Number(request.headers.get('content-length')) > MAX_BODY) return Response.json({ error: 'Image request exceeds 6 MB' }, { status: 413 });
  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'Missing JSON body' }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return Response.json({ error: 'Image request exceeds 6 MB' }, { status: 413 }); }
      chunks.push(value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: 'Expected valid imageBase64 and mimeType (image/png, image/jpeg or image/webp)' }, { status: 400 });
  try { return Response.json(await withMemoryLedger(() => identify(parsed.data.imageBase64, parsed.data.mimeType, undefined, request.signal))); }
  catch (error) { return Response.json({ error: error instanceof Error && error.message.startsWith('Image identification returned') ? error.message : 'Image identification is unavailable; please retry.' }, { status: 502 }); }
}
