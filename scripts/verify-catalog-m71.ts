import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const before = sha(readFileSync('data/catalog.json'));
execFileSync(process.execPath, ['--import','tsx','scripts/build-catalog.ts'], { stdio: 'inherit' });
const after = sha(readFileSync('data/catalog.json'));
if (before !== after) throw new Error('Offline rebuild changed catalog');
const inputs = z.array(z.object({ file: z.string(), url: z.string(), sha256: z.string(), storedSha256: z.string(), license: z.string(), attribution: z.string(), retrieved: z.string(), updated: z.string(), terms: z.string() })).parse(JSON.parse(readFileSync('data/raw/m71/manifest.json','utf8')));
for (const input of inputs) {
  const b = readFileSync(input.file);
  if (sha(b) !== input.storedSha256 || sha(gunzipSync(b)) !== input.sha256) throw new Error(`Snapshot mismatch ${input.file}`);
}
const legacy = JSON.parse(readFileSync('data/raw/manifest.json','utf8'));
writeFileSync('artifacts/M7.1-reproducibility.json', JSON.stringify({ catalogSha256: after, offlineRebuildIdentical: true, inputs: [...legacy,...inputs], manualOverrides: { file: 'data/catalog-overrides.json', sha256: sha(readFileSync('data/catalog-overrides.json')) } }, null, 2)+'\n');
const marker = '\n<!-- M7.1 snapshot hashes -->';
const doc = readFileSync('data/catalog-sources.md','utf8').split(marker)[0];
writeFileSync('data/catalog-sources.md', doc+marker+'\n\nAll following inputs retrieved 2026-11-03. SHA-256 hashes are of the original download bytes before local gzip storage. Stored-file hashes, licence, attribution and update date for every input are in `raw/m71/manifest.json` and `../artifacts/M7.1-reproducibility.json`.\n\n| File | URL | SHA-256 |\n| --- | --- | --- |\n'+inputs.map(i => `| ${i.file} | ${i.url} | ${i.sha256} |`).join('\n')+'\n');
console.info('Verified offline catalog and all international snapshot hashes:', after);
