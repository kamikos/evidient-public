import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { z } from 'zod';
import { runRequestedPair } from '../server/agent/request';
import { mapConcurrent } from '../server/agent/runtime';
import { audit, budgeted, installTransport, judgeUnavailable, readPairs, save, spent, material, type BatchPair } from './batch-common';
import { rebuildIndex } from './rebuild-batch-index';
import type { EvidenceRecord } from '../shared/contract';

const emptySchema = z.object({ pair: z.string(), searched: z.array(z.string()) });
async function main() {
  process.env.SPEND_LEDGER_FILE = 'artifacts/M10-spend.jsonl';
  process.env.MODEL_SPEND_CAP_USD = '45';
  process.env.MAX_RUN_REQUESTS = '60';
  mkdirSync('artifacts', { recursive: true }); mkdirSync('data/batch/evidence', { recursive: true });
  installTransport();
  const started = Date.now();
  const n = Number(process.argv[2] ?? 150);
  if (!Number.isInteger(n) || n < 1) throw new Error('Expected positive integer pair count');
  const pairs = readPairs().slice(0, n);
  const empty = existsSync('data/batch/empty.json') ? z.array(emptySchema).parse(JSON.parse(readFileSync('data/batch/empty.json', 'utf8'))) : [];
  const pending = pairs.filter(p => !existsSync(`data/batch/evidence/${p.pair}.json`) && !empty.some(e => e.pair === p.pair));
  const failed = new Map<string, string[]>();
  async function run(pair: BatchPair, attempt: number) {
    if (spent() >= 43) { failed.set(pair.pair, ['budget stop']); return; }
    const at = Date.now();
    try {
      const record = await budgeted(() => runRequestedPair(pair.a, pair.b, {
        labels: async side => material(side.id).sections,
        classes: async rxcui => {
          const { resolveRequested } = await import('../server/agent/request');
          const side = [pair.a, pair.b].find(id => resolveRequested(id).rxcui === rxcui);
          return side ? material(side).classes : [];
        },
      }));
      if (judgeUnavailable(record)) throw new Error('judge unavailable');
      const problems = await audit(record);
      if (problems.length) throw new Error(problems.join(', '));
      if (!record.card.claims.some(c => c.accepted)) {
        empty.push({ pair: pair.pair, searched: [...new Set(record.card.gaps.flatMap(g => g.searched))] });
        empty.sort((a, b) => a.pair.localeCompare(b.pair)); save('data/batch/empty.json', empty);
      } else {
        const compact: EvidenceRecord = { card: record.card, trace: record.trace.map(event => event.type === 'tool_result' ? { ...event, summary: event.summary.slice(0, 300) } : event) };
        save(`data/batch/evidence/${pair.pair}.json`, compact);
      }
      failed.delete(pair.pair);
      appendFileSync('artifacts/M10-runs.jsonl', JSON.stringify({ pair: pair.pair, attempt, accepted: record.card.claims.filter(c => c.accepted).length, seconds: (Date.now() - at) / 1000, spent: spent() }) + '\n');
      console.log(`${pair.pair}: ${record.card.claims.filter(c => c.accepted).length} accepted; $${spent().toFixed(3)}`);
    } catch (error) {
      // Only fixed pipeline errors and audit problem codes are retained, never upstream bodies or credentials.
      const message = error instanceof Error && /^(judge unavailable|Evidence generation|Live runs|M10 hard|Evidence generation exceeded|origin|empty reported|length|advice|citations|inline citations|too many|one-sided|verification:|quote:|source:)/.test(error.message) ? error.message : 'run failed';
      failed.set(pair.pair, [message]);
      appendFileSync('artifacts/M10-runs.jsonl', JSON.stringify({ pair: pair.pair, attempt, failure: message, seconds: (Date.now() - at) / 1000, spent: spent() }) + '\n');
      console.log(`${pair.pair}: ${message}; $${spent().toFixed(3)}`);
    }
  }
  await mapConcurrent(pending, 3, p => run(p, 1));
  // One retry per pair, deferred so verifier outages are retried after the first pass.
  await mapConcurrent(pending.filter(p => failed.has(p.pair)), 3, p => run(p, 2));
  const rows = await rebuildIndex();
  if (!existsSync('data/batch/empty.json')) save('data/batch/empty.json', empty);
  save('artifacts/M10-results.json', { requested: n, attempted: pending.length, shipped: rows.length, empty: empty.length, failed: [...failed].map(([pair, problems]) => ({ pair, problems })), spend: spent(), wallSeconds: (Date.now() - started) / 1000 });
  console.log(`Finished: ${rows.length} shipped, ${empty.length} empty, ${failed.size} failed; $${spent().toFixed(4)}`);
}
void main();
