import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:8081';
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const lines = [];
function log(text) { console.log(text); lines.push(text); }
for (const route of ['/api/substances?q=sert', '/api/graph?ids=alcohol,metronidazole,sertraline', '/api/health']) {
  const result = spawnSync(curl, ['--fail-with-body', '-sS', '--max-time', '45', base + route], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  if (route.includes('substances')) assert.equal(data.results[0].id, 'sertraline');
  if (route.includes('graph')) { assert.equal(data.substances.length, 3); assert.equal(data.edges.length, 2); }
  if (route.includes('health')) assert.equal(typeof data.ok, 'boolean');
  log(`curl ${route}\n${result.stdout}`);
}
log('curl -N /api/sse-test');
const start = Date.now();
const arrivals = [];
await new Promise((resolve, reject) => {
  const child = spawn(curl, ['--fail-with-body', '-sS', '-N', '--max-time', '10', base + '/api/sse-test']);
  let pending = '';
  child.stdout.on('data', chunk => {
    pending += chunk.toString();
    while (pending.includes('\n\n')) {
      const split = pending.indexOf('\n\n');
      const event = pending.slice(0, split);
      pending = pending.slice(split + 2);
      const elapsed = Date.now() - start;
      arrivals.push(elapsed);
      log(`[+${elapsed}ms] ${event}`);
    }
  });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve() : reject(new Error(`curl exited ${code}`)));
});
assert.equal(arrivals.length, 5);
for (let index = 1; index < arrivals.length; index++) assert.ok(arrivals[index] - arrivals[index - 1] >= 200, 'Events were buffered');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/acceptance-http.txt', lines.join('\n\n') + '\n');
