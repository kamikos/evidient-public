import { edges } from '../data/edges';
import { substances } from '../data/substances';
import { getLabelSections } from '../server/tools/openfda';
import { getSourceText } from '../server/tools/sourceStore';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

async function writeSnapshot(snapshot: { kind: string; id: string; text: string; url: string; fetchedAt: string }) {
  const target = path.join(process.cwd(), 'data', 'sources', snapshot.kind, `${snapshot.id.replace(/#/g, '__')}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  await rename(temporary, target);
}

async function main() {
  // Explicit refresh of the pinned FDA labels. Never silently reselect a product.
  const selected = process.argv.find(arg => arg.startsWith('--substances='))?.slice(13).split(',');
  for (const substance of substances.filter(s => s.kind !== 'alcohol' && (!selected || selected.includes(s.id)))) {
    for (const section of await getLabelSections(substance.id)) {
      await writeSnapshot({ ...section, fetchedAt: new Date().toISOString() });
    }
  }
  for (const source of edges.flatMap(edge => edge.seedSources)) await getSourceText(source);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
