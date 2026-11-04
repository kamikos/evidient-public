import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import type { EvidenceRecord } from '../shared/contract';
import { computeSignal } from '../server/agent/derive';

async function main() {
  for (const name of (await readdir('data/evidence')).filter(name => name.endsWith('.json'))) {
    const target = `data/evidence/${name}`;
    const record: EvidenceRecord = JSON.parse(await readFile(target, 'utf8'));
    record.card.signal = computeSignal(record.card);
    for (const event of record.trace) {
      if (event.type === 'card_ready') event.card.signal = computeSignal(event.card);
    }
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2) + '\n');
    await rename(temporary, target);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
