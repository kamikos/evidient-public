// Run against an already built, locally served export. Never writes curated evidence.
const started = Date.now();
const response = await fetch('http://localhost:8097/api/evidence/alcohol__metronidazole?live=1&inject=1', { signal: AbortSignal.timeout(245_000) });
if (!response.ok) throw new Error(`Live smoke HTTP ${response.status}: ${await response.text()}`);
const events = [];
let pending = '';
for await (const chunk of response.body) {
  pending += new TextDecoder().decode(chunk, { stream: true });
  const lines = pending.split('\n'); pending = lines.pop();
  for (const line of lines) if (line.startsWith('data: ')) {
    const event = JSON.parse(line.slice(6)); events.push(event);
    if (event.type === 'thinking' || event.type === 'error') console.error(event.type, event.text ?? event.message);
  }
}
const card = events.find(e => e.type === 'card_ready')?.card;
const requests = events.find(e => e.type === 'thinking' && /^Made \d+ external requests$/.test(e.text))?.text;
const planted = card?.claims.filter(c => c.injected) ?? [];
console.log(JSON.stringify({ seconds: (Date.now() - started) / 1000, requests, card_ready: !!card,
  accepted: card?.claims.filter(c => c.accepted).length,
  planted: planted.map(c => ({ id: c.id, accepted: c.accepted, quoteCheck: c.quoteCheck, support: c.support, rationale: c.judgeRationale })),
  errors: events.filter(e => e.type === 'error') }, null, 2));
if (!card || planted.length !== 2 || planted.some(c => c.accepted)) process.exitCode = 1;
