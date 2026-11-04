import { access, readFile, writeFile } from 'node:fs/promises';
import type { EvidenceRecord } from '../shared/contract';
import { fetchAbstracts } from '../server/tools/pubmed';
import { quoteMatches } from '../server/agent/verify';

async function main() {
  const selected = process.argv.find(arg => arg.startsWith('--pair='))?.slice(7).split(',');
  if (!selected?.length) throw new Error('Supply --pair=a__b,c__d');
  const ids = new Set<string>();
  for (const pair of selected) {
    if (!/^[a-z-]+__[a-z-]+$/.test(pair)) throw new Error('Invalid pair');
    const record: EvidenceRecord = JSON.parse(await readFile(`data/evidence/${pair}.json`, 'utf8'));
    for (const source of record.card.sources) if (source.kind === 'pubmed') ids.add(source.id);
  }
  for (const id of ids) {
    const target = `data/sources/pubmed/${id}.json`;
    try { await access(target); continue; }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const article = (await fetchAbstracts([id]))[0];
    if (!article?.abstractText) throw new Error(`Missing abstract ${id}`);
    await writeFile(target, JSON.stringify({ kind: 'pubmed', id, text: article.abstractText,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, fetchedAt: new Date().toISOString() }, null, 2) + '\n');
  }
  for (const pair of selected) {
    const record: EvidenceRecord = JSON.parse(await readFile(`data/evidence/${pair}.json`, 'utf8'));
    for (const claim of record.card.claims.filter(claim => claim.accepted)) {
      const source: { text: string } = JSON.parse(await readFile(
        `data/sources/${claim.source.kind}/${claim.source.id.replace(/#/g, '__')}.json`, 'utf8'));
      if (!quoteMatches(claim.quote, source.text)) throw new Error(`Snapshot quote mismatch ${pair}:${claim.id}`);
    }
  }
  console.log(`Checked accepted quotes against snapshots for ${selected.length} cards.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
