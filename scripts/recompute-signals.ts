// Re-derives every shipped card's signal from its accepted label quotes with the current rule in server/agent/derive.ts.
// Dry run by default; pass --write to save. Run `npm run build:web` afterwards so the index and bundles pick it up.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { EvidenceRecord } from '../shared/contract';
import { computeSignal } from '../server/agent/derive';

const write = process.argv.includes('--write');
let changed = 0;
for (const dir of ['data/evidence', 'data/batch/evidence']) {
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const path = `${dir}/${file}`;
    const raw = readFileSync(path, 'utf8');
    const record: EvidenceRecord = JSON.parse(raw);
    const card = record.card;
    if (!card.claims.some(c => c.accepted)) continue;
    const next = computeSignal(card);
    if (card.signal && card.signal.level === next.level && card.signal.basis.join() === next.basis.join()) continue;
    changed++;
    const basis = card.claims.find(c => c.id === next.basis[0]);
    console.log(`${card.pair}: ${card.signal?.level} -> ${next.level}\n    "${(basis?.quoteEnglish ?? basis?.quote ?? '').slice(0, 160)}"`);
    if (write) {
      card.signal = next;
      writeFileSync(path, JSON.stringify(record, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
    }
  }
}
console.log(`${changed} cards ${write ? 'updated' : 'would change'}`);
