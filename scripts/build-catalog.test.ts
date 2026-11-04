import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { assertCleanEncoding, decodeSource, brandRemoval, cleanBrands } from './build-catalog';
import { unzip } from './catalog-international';
import type { CatalogEntry } from '../shared/contract';
const catalogEntrySchema = z.object({ id: z.string(), name: z.string(), synonyms: z.array(z.string()), brands: z.array(z.object({ name: z.string(), markets: z.array(z.enum(['US','CA','NO','PL','FR','IT','ES','EU'])) })), rxcui: z.string().optional() });

const entries = z.array(catalogEntrySchema).parse(JSON.parse(readFileSync('data/catalog.json', 'utf8')));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('strict decoding preserves Polish UTF-8 through gzip and French legacy accents', () => {
  const polish = 'Fervex ból i gorączka';
  assert.equal(decodeSource(gunzipSync(gzipSync(Buffer.from(polish))), 'utf-8'), polish);
  assert.equal(decodeSource(Uint8Array.from([0x63,0x75,0x74,0x61,0x6e,0xe9,0x65]), 'windows-1252'), 'cutanée');
  assert.throws(() => decodeSource(Uint8Array.from([0xe9]), 'utf-8'));
  for (const bad of ['bad\uFFFD', 'bÃ³l', 'Å‚']) assert.throws(() => assertCleanEncoding(bad));
  assertCleanEncoding(JSON.stringify(entries));
  assert(entries.find(e => e.id === 'acetaminophen')?.brands.some(b => b.name === polish));
});

test('generic names are excluded by ingredient prefix or descriptor tokens', () => {
  for (const name of ['Acetaminophen', 'ACETAMINOPHEN CAPLETS', 'Paracetamol Biofarm']) assert.equal(brandRemoval(name, 'acetaminophen', ['paracetamol']), 'ingredientPrefix');
  for (const name of ['Pain Relief', 'Pain Relief Extra Strength', 'Pain Reliever', 'childrens Pain and Fever', "Children’s oral solution", 'sleep aid tablets']) assert.equal(brandRemoval(name, 'acetaminophen', []), 'genericDescriptors');
  for (const name of ['Tylenol Extra Strength', 'Advil', 'PainAway']) assert.equal(brandRemoval(name, 'acetaminophen', []), undefined);
});

test('case variants merge markets and prefer mixed case; uppercase display retains original search alias', () => {
  const entry: CatalogEntry = { id: 'test', name: 'Ingredient', synonyms: [], brands: [{ name: 'DOLIPRANE', markets: ['FR'] }, { name: 'Doliprane', markets: ['CA'] }, { name: 'MOTRIN', markets: ['US'] }], labelUrl: 'https://example.org' };
  cleanBrands(entry);
  assert.deepEqual(entry.brands, [{ name: 'Doliprane', markets: ['CA','FR'] }, { name: 'Motrin', markets: ['US'] }]);
  assert(entry.synonyms.includes('MOTRIN'));
  for (const e of entries) assert.equal(new Set(e.brands.map(b => b.name.toLowerCase())).size, e.brands.length);
});

test('Canadian Motrin survives display normalization and all reviewed brands remain searchable', async () => {
  const { searchCatalog } = await import('../server/catalog-search');
  const brand = entries.find(e => e.id === 'ibuprofen')?.brands.find(b => b.name === 'Motrin');
  assert(brand?.markets.includes('CA'));
  assert.equal(searchCatalog('MOTRIN').results[0]?.id, 'ibuprofen');
  for (const [ingredient, name] of expected) assert.equal(searchCatalog(name).results[0]?.id, ingredient);
});

const expected: [string, string][] = [['acetaminophen','Tylenol'],['ibuprofen','Motrin'],['ibuprofen','Advil'],['diphenhydramine','Benadryl'],['cetirizine','Zyrtec'],['alprazolam','Xanax'],['zolpidem','Ambien'],['sertraline','Zoloft'],['lorazepam','Ativan'],['tramadol','Ultram'],['metronidazole','Flagyl'],['warfarin','Coumadin'],['amphetamine','Adderall'],['methylphenidate','Ritalin'],['methylphenidate','Concerta']];

test('audits requested US brands against complete committed RxNorm and NDC sources', () => {
  const ndcSchema = z.object({ results: z.array(z.object({ brand_name: z.string().optional(), active_ingredients: z.array(z.object({ name: z.string() })).optional(), marketing_end_date: z.string().optional() })) });
  const ndc = unzip(gunzipSync(readFileSync('data/raw/m71/ndcbulk.gz'))).flatMap(b => ndcSchema.parse(JSON.parse(decodeSource(b, 'utf-8'))).results);
  const audit = expected.map(([ingredient,brand]) => {
    const entry = entries.find(e => e.id === ingredient); assert(entry?.rxcui);
    const endpoint = `Prescribe/rxcui/${entry.rxcui}/related.json?tty=BN%20SBD`;
    const groups = z.object({ relatedGroup: z.object({ conceptGroup: z.array(z.object({ tty: z.string(), conceptProperties: z.array(z.object({ name: z.string() })).optional() })).optional() }) }).parse(JSON.parse(readFileSync(`data/raw/rxnav/${sha(Buffer.from(endpoint))}.json`,'utf8'))).relatedGroup.conceptGroup ?? [];
    const rxNormBN = groups.filter(g => g.tty === 'BN').some(g => g.conceptProperties?.some(c => c.name.toLowerCase() === brand.toLowerCase()));
    const rxNormSingleIngredient = groups.filter(g => g.tty === 'SBD').some(g => g.conceptProperties?.some(c => !c.name.includes(' / ') && c.name.endsWith(`[${brand}]`)));
    const records = ndc.filter(p => p.brand_name?.toLowerCase() === brand.toLowerCase());
    const ndcEligible = records.filter(p => p.active_ingredients?.length === 1 && (!p.marketing_end_date || p.marketing_end_date >= '20261103'));
    const retained = entry.brands.find(b => b.name.toLowerCase() === brand.toLowerCase());
    assert(retained, `${ingredient}: ${brand} missing`);
    if (rxNormSingleIngredient || ndcEligible.length) assert(retained.markets.includes('US'), `${brand}: source-backed US market missing`);
    return { ingredient, brand, rxNormBN, rxNormSingleIngredient, ndcExactRecords: records.length, ndcEligible: ndcEligible.length, markets: retained.markets, reason: rxNormSingleIngredient ? 'RxNorm single-ingredient brand retained without reviewed cap' : ingredient === 'amphetamine' ? 'Existing overrides-file mixed-salts exception' : 'Absent from RxNorm BN and exact-name NDC snapshot; existing override retained, no US market inferred' };
  });
  writeFileSync('artifacts/M7.2-brand-audit.json', JSON.stringify(audit,null,2)+'\n');
});

test('offline rebuild is identical and every international snapshot hash still matches', () => {
  const before = sha(readFileSync('data/catalog.json'));
  execFileSync(process.execPath, ['--import','tsx','scripts/build-catalog.ts'], { stdio: 'inherit' });
  assert.equal(sha(readFileSync('data/catalog.json')), before);
  assert(readFileSync('data/catalog.json').byteLength < 700000);
  const inputs = z.array(z.object({ file: z.string(), sha256: z.string(), storedSha256: z.string() })).parse(JSON.parse(readFileSync('data/raw/m71/manifest.json','utf8')));
  for (const input of inputs) { const stored = readFileSync(input.file); assert.equal(sha(stored),input.storedSha256); assert.equal(sha(gunzipSync(stored)), input.sha256); }
  writeFileSync('artifacts/M7.2-reproducibility.json', JSON.stringify({ catalogSha256: before, offlineRebuildIdentical: true, internationalSnapshotHashesVerified: inputs.length },null,2)+'\n');
});
