import { writeFile } from 'node:fs/promises';
const paths = ['/api/request?a=ibuprofen&b=sertraline', '/api/evidence/alcohol__lorazepam?live=1', '/api/request?a=ibuprofen&b=lisinopril'];
const results = [];
let spend = 0;
for (const [index, path] of paths.entries()) {
  if (spend >= 1.5) throw new Error('Stopping before the $2 task cap');
  const start = Date.now();
  const response = await fetch(`http://localhost:8098${path}`, { headers: { 'x-forwarded-for': `192.0.2.${210 + index}` } });
  const raw = await response.text();
  await writeFile(`artifacts/M8.1-live-${index + 1}.sse`, raw);
  const events = raw.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
  const card = events.find(e => e.type === 'card_ready')?.card;
  const thinking = events.filter(e => e.type === 'thinking').map(e => e.text);
  const cost = Number(thinking.find(t => t.startsWith('Estimated model spend:'))?.split('$')[1] ?? 0);
  spend += cost;
  const result = { path, seconds: (Date.now() - start) / 1000, status: response.status, judged: events.filter(e => e.type === 'claim_judged').length, accepted: card?.claims.filter(c => c.accepted).length ?? 0, requests: thinking.find(t => t.startsWith('Made ')), cost, totalCost: spend, failures: thinking.filter(t => /judge.*fail|judge.*unavailable/i.test(t)), error: events.find(e => e.type === 'error') ?? null, card: !!card };
  results.push(result);
  console.log(JSON.stringify(result));
  await writeFile('artifacts/M8.1-live-results.json', JSON.stringify(results, null, 2));
}
if (results.some(r => !r.judged || r.failures.length || r.error || !r.card)) process.exitCode = 1;
