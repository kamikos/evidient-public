import { mkdir, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { TraceEvent } from '../shared/contract';
import { edges } from '../data/edges';
import { getEnv } from '../server/env';
import { runEdge } from '../server/agent/run';
import { mapConcurrent, withUsage, type Usage, estimatedUSD } from '../server/agent/runtime';
async function main() {
  if (!getEnv().modelApiKey) throw new Error('MODEL_API_KEY is not configured. No live runs performed.');
  const directory = path.join(process.cwd(), 'data', 'evidence');
  await mkdir(directory, { recursive: true });
  const selected = process.argv.find(arg => arg.startsWith("--pair="))?.slice(7);
  const jobs = [...edges.map(edge => ({ pair: edge.pair, inject: false })), { pair: 'alcohol__metronidazole', inject: true }].filter(job => !selected || selected.split(',').includes(job.pair));
  const totals: Usage = { input: 0, output: 0 };
  const rows = await mapConcurrent(jobs, 3, async job => {
    const target = path.join(directory, `${job.pair}${job.inject ? '.inject' : ''}.json`);
    if (!process.argv.includes('--force')) {
      try { await access(target); return { pair: job.pair, inject: job.inject, status: 'skipped' }; }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
    const started = Date.now();
    const usage: Usage = { input: 0, output: 0 };
    try {
      return await withUsage(usage, async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const events: TraceEvent[] = [];
          try {
            const record = await runEdge(job.pair, { usage, inject: job.inject, onEvent: event => events.push(event) });
            const temporary = `${target}.${randomUUID()}.tmp`;
            await writeFile(temporary, JSON.stringify(record, null, 2) + '\n'); await rename(temporary, target);
            const accepted = record.card.claims.filter(c => c.accepted).length;
            console.log(job.pair + (job.inject ? '.inject' : ''), 'written', accepted, 'accepted', ((Date.now() - started) / 1000).toFixed(1), 'seconds');
            return { pair: job.pair, inject: job.inject, status: 'written', proposed: record.card.claims.length,
              accepted, rejected: record.card.claims.length - accepted, requests: Number(record.trace.filter(e => e.type === 'thinking').map(e => e.text.match(/^Made (\d+) external requests$/)?.[1]).find(Boolean) ?? 0), depth: record.card.depth, conflicts: record.card.conflicts.length, gaps: record.card.gaps.length, seconds: (Date.now() - started) / 1000,
              inputTokens: usage.input, outputTokens: usage.output, estimatedUSD: estimatedUSD(usage), byModel: usage.byModel };
          } catch (error) { await writeFile(`artifacts/M4-failed-${job.pair}${job.inject ? '.inject' : ''}-${attempt + 1}.json`, JSON.stringify(events, null, 2)); console.log(job.pair, 'attempt', attempt + 1, error instanceof Error ? error.message : 'Failed'); if (attempt === 2) throw new Error('Failed after initial attempt and two retries'); }
        }
        throw new Error('Unreachable');
      });
    } catch { process.exitCode = 1; return { pair: job.pair, inject: job.inject, status: 'failed', inputTokens: usage.input, outputTokens: usage.output }; }
    finally { totals.input += usage.input; totals.output += usage.output; for (const [model, tokens] of Object.entries(usage.byModel ?? {})) { const aggregate = (totals.byModel ??= {})[model] ??= { input: 0, output: 0 }; aggregate.input += tokens.input; aggregate.output += tokens.output; } }
  });
  console.table(rows);
  console.log(JSON.stringify({ totalUsage: totals, estimatedUSD: estimatedUSD(totals) }));
  await mkdir('artifacts', { recursive: true });
  await writeFile(`artifacts/M4-precompute${selected ? '-' + (selected.length > 100 ? createHash('sha256').update(selected).digest('hex').slice(0, 16) : selected) : ''}.json`, JSON.stringify({ rows, totals }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Precompute failed'); process.exitCode = 1; });
