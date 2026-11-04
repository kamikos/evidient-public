import { writeFile } from 'node:fs/promises';

// Usage: node scripts/follow-run.mjs https://host/api/evidence/alcohol__lorazepam?live=1 [output.json]
const initial = process.argv[2];
if (!initial) throw new Error('Pass a full live-run URL');
const origin = new URL(initial).origin;
const started = Date.now();
const events = [];
const phases = [];
let url = initial;
let state;
let cost = 0;
let finished = false;
for (let phase = 1; phase <= 20; phase++) {
  const start = Date.now();
  const response = await fetch(url, {
    ...(state ? { method: 'POST', body: JSON.stringify({ state }) } : {}),
    headers: { accept: 'text/event-stream', 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.245' },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Phase ${phase} HTTP ${response.status}: ${await response.text()}`);
  const raw = await response.text();
  const batch = raw.split('\n\n').filter(frame => frame.startsWith('data: ')).map(frame => JSON.parse(frame.slice(6)));
  const checkpoint = batch.find(event => event.type === 'checkpoint');
  events.push(...batch.filter(event => event.type !== 'checkpoint'));
  const fetches = Number(/: phase \d+ fetches (\d+)/.exec(raw)?.[1] ?? NaN);
  phases.push({ phase, fetches, seconds: (Date.now() - start) / 1000, stateBytes: checkpoint?.state.length ?? 0 });
  console.log(JSON.stringify(phases.at(-1)));
  if (fetches > 8) throw new Error('Phase exceeded eight fetches');
  if (checkpoint) {
    const next = new URL(checkpoint.next, origin);
    if (next.origin !== origin) throw new Error('Cross-origin checkpoint');
    url = next.href; state = checkpoint.state;
    continue;
  }
  const card = events.find(event => event.type === 'card_ready')?.card;
  cost = Number(events.find(event => event.type === 'thinking' && event.text.startsWith('Estimated model spend:'))?.text.split('$')[1] ?? 0);
  const result = { url: initial, phases, seconds: (Date.now() - started) / 1000, cost,
    judged: events.filter(event => event.type === 'claim_judged').length,
    accepted: card?.claims.filter(claim => claim.accepted).length ?? 0,
    failures: events.filter(event => event.type === 'error' || event.type === 'thinking' && /judge.*unavailable|judge.*fail/i.test(event.text)), card, events };
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, card: !!card, events: undefined }));
  if (!card || !result.judged || result.failures.length || card.claims.some(claim => claim.judgeRationale === 'Judge unavailable')) process.exitCode = 1;
  finished = true;
  break;
}
if (!finished) throw new Error('Run exceeded twenty phases');
