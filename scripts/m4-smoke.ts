import { writeFile } from 'node:fs/promises';
import { runEdge } from '../server/agent/run';
import { withUsage, estimatedUSD, type Usage } from '../server/agent/runtime';
const usage: Usage = { input: 0, output: 0 };
const started = Date.now();
withUsage(usage, async () => {
  try {
    const record = await runEdge('alcohol__metronidazole', { usage, onEvent: event => console.log(((Date.now()-started)/1000).toFixed(1), event.type, event.type === 'thinking' ? event.text : event.type === 'tool_call' ? event.name : '') });
    await writeFile('artifacts/M4-smoke.json', JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ accepted: record.card.claims.filter(c=>c.accepted).length, depth: record.card.depth, conflicts: record.card.conflicts.length, gaps: record.card.gaps.length }));
  } catch (error) { console.error(error instanceof Error ? error.message : 'Failed'); process.exitCode=1; }
  finally { await writeFile('artifacts/M4-smoke-usage.json', JSON.stringify({usage, seconds:(Date.now()-started)/1000, usd: estimatedUSD(usage)}, null, 2)); }
});
