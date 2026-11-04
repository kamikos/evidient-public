import { writeFile } from 'node:fs/promises';
const pairs = [['levothyroxine', 'alcohol'], ['ibuprofen', 'lisinopril'], ['cetirizine', 'amoxicillin']];
const results = [];
for (const [a, b] of pairs) {
  const started = Date.now();
  const response = await fetch(`http://localhost:8098/api/request?a=${a}&b=${b}`, { headers: { 'cf-connecting-ip': '192.0.2.188' } });
  const raw = await response.text();
  await writeFile(`artifacts/M8-live-${a}-${b}.sse`, raw);
  const events = raw.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
  const card = events.find(e => e.type === 'card_ready')?.card;
  const result = { a, b, durationSeconds: (Date.now() - started)/1000, status: response.status, externalRequests: events.find(e => e.type === 'thinking' && /Made \d+ external/.test(e.text))?.text ?? null, acceptedClaims: card?.claims.filter(c => c.accepted).length ?? null, signal: card?.signal, headline: card?.headline.text, failure: events.find(e => e.type === 'error') ?? (card?.claims.some(c => c.judgeRationale === 'Judge unavailable') ? 'Independent judge unavailable; no claims accepted' : card ? null : raw.slice(0, 200)) };
  results.push(result);
  console.log(JSON.stringify(result));
  await writeFile('artifacts/M8-live-results.json', JSON.stringify(results, null, 2));
}
