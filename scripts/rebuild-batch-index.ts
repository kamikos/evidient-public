import { readdirSync, readFileSync } from 'node:fs';
import type { EvidenceRecord } from '../shared/contract';
import { audit, installTransport, judgeUnavailable, save } from './batch-common';

export async function rebuildIndex() {
  const rows = [];
  for (const file of readdirSync('data/batch/evidence').filter(f => f.endsWith('.json')).sort()) {
    // Files are written only by batch-reviews after the pipeline's typed output and audit.
    const record: EvidenceRecord = JSON.parse(readFileSync(`data/batch/evidence/${file}`, 'utf8'));
    const problems = await audit(record);
    if (judgeUnavailable(record) || problems.length || !record.card.claims.some(c => c.accepted)) throw new Error(`Invalid shipped card ${file}: ${problems.join(',')}`);
    const c = record.card;
    if (!c.signal) throw new Error(`Missing signal ${file}`);
    rows.push({ pair: c.pair, a: c.a, b: c.b, level: c.signal.level, conflict: c.signal.conflict, category: c.category, headline: c.headline.text, depth: c.depth });
  }
  save('data/batch/index.json', rows);
  return rows;
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/rebuild-batch-index.ts')) {
  installTransport(); void rebuildIndex().then(rows => console.log(`Indexed ${rows.length} cards`));
}
