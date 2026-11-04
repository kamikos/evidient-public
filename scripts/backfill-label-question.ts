import { readFile, writeFile, readdir } from 'node:fs/promises';
const old = 'The label describes this interaction, but I found no human studies of it. How is this usually handled for someone like me?';
const replacement = 'The label describes this interaction, but there seem to be no human studies of it. How is it usually handled for someone like me?';
async function main() {
const files: string[] = [];
for (const name of (await readdir('data/evidence')).sort()) {
  if (!name.endsWith('.json')) continue;
  const file = 'data/evidence/'+name, text = await readFile(file, 'utf8');
  if (!text.includes(old) && !text.includes(replacement)) continue;
  const updated = text.replaceAll(old, replacement);
  if (updated !== text) await writeFile(file, updated);
  files.push(file);
}
await writeFile('artifacts/M7.1-question-backfill.json', JSON.stringify(files, null, 2)+'\n');

}
main().catch(error => { console.error(error); process.exitCode = 1; });
