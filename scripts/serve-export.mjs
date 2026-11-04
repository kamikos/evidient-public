// Minimal API-only server for exercising the actual Expo export under Node.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const requested = require('../dist/server/_expo/functions/api/request+api.js');
const evidence = require('../dist/server/_expo/functions/api/evidence/[pair]+api.js');
const continuation = require('../dist/server/_expo/functions/api/continue+api.js');
createServer(async (incoming, outgoing) => {
  try {
    const controller = new AbortController();
    outgoing.on('close', () => controller.abort());
    const url = new URL(incoming.url, 'http://localhost:8098');
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(url, { method: incoming.method, headers: incoming.headers,
      ...(body.length ? { body } : {}), signal: controller.signal });
    const response = url.pathname === '/api/continue' ? await continuation.POST(request)
      : url.pathname === '/api/request' ? await requested.GET(request)
      : await evidence.GET(request, { pair: url.pathname.split('/').at(-1) });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) { outgoing.writeHead(500); outgoing.end(String(error)); }
}).listen(Number(process.env.PORT ?? 8098), '127.0.0.1', () => console.log(`Export API listening on ${process.env.PORT ?? 8098}`));
