// Registry-only build. No model client, credentials, or generated name lists.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { international, unzip } from './catalog-international';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { substances } from '../data/substances';
import type { CatalogEntry } from '../shared/contract';

const online = process.argv.includes('--download');
const target = 1000;
const minimumUSBrands = 2;
const root = 'data/raw';
const rplUrl = 'https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/get-csv';
const rxBase = 'https://rxnav.nlm.nih.gov/REST/';
const inputs = new Map<string, { file: string; url: string; sha256: string; retrieved: string; license: string; attribution: string }>();
function recordInput(file: string, url: string, text: string) {
  inputs.set(file, { file, url, sha256: createHash('sha256').update(text).digest('hex'), retrieved: '2026-11-03', license: url === rplUrl ? 'CC BY 4.0' : 'NLM RxNorm public domain / RxNav non-proprietary API terms', attribution: url === rplUrl ? 'Centrum e-Zdrowia / URPL, Rejestr Produktow Leczniczych, retrieved 2026-11-03; filtered and mapped' : 'U.S. National Library of Medicine, NIH, HHS; no NLM endorsement' }); return text;
}
let nextRequest = 0;
async function cached(file: string, url: string): Promise<string> {
  try { return recordInput(file, url, decodeSource(await readFile(file), 'utf-8')); } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  if (!online) throw new Error(`Missing offline input ${file}. Run with --download.`);
  const delay = Math.max(0, nextRequest - Date.now());
  nextRequest = Math.max(nextRequest, Date.now()) + 110;
  await new Promise(resolve => setTimeout(resolve, delay));
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) {
      if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)); continue;
      }
      throw new Error(`${response.status}: ${url}`);
    }
    const text = decodeSource(Buffer.from(await response.arrayBuffer()), 'utf-8');
    await writeFile(file, text);
    return recordInput(file, url, text);
  }
}
async function rx(endpoint: string) {
  const key = createHash('sha256').update(endpoint).digest('hex');
  return JSON.parse(await cached(`${root}/rxnav/${key}.json`, rxBase + endpoint));
}
const concept = z.object({ rxcui: z.string(), name: z.string(), tty: z.string().optional() });
const allSchema = z.object({ minConceptGroup: z.object({ minConcept: z.array(concept) }) });
const relatedSchema = z.object({ relatedGroup: z.object({ conceptGroup: z.array(z.object({ tty: z.string(), conceptProperties: z.array(concept).optional() })).optional() }) });
const overridesSchema = z.object({ note: z.string(), entries: z.array(z.object({ ingredient: z.string(), synonyms: z.array(z.string()).default([]), brands: z.array(z.object({ name: z.string(), markets: z.array(z.enum(['US', 'CA', 'NO', 'PL', 'FR', 'IT', 'ES', 'EU'])) })) })) });
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ';' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').toLowerCase().trim();
// Explicit source encodings. Never silently substitute invalid byte sequences.
export function assertCleanEncoding(text: string) {
  if (/[\uFFFD\u00C3\u00C5]/u.test(text)) throw new Error('Replacement character or mojibake in catalogue text');
}
export function decodeSource(bytes: Uint8Array, charset: 'utf-8' | 'windows-1252') {
  const text = new TextDecoder(charset, { fatal: true }).decode(bytes);
  return text;
}
const foldBrand = (s: string) => normalize(s.toLowerCase()).replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Whole tokens only: a distinctive token such as Tylenol makes the name a brand.
const genericWords = new Set(('pain relief reliever fever cold allergy sleep aid extra strength children childrens infant infants baby adult adults tablet tablets caplet caplets capsule capsules injection solution oral generic and for of the chewable coated extended release maximum regular liquid suspension drops syrup gel cream topical').split(' '));
export function brandRemoval(name: string, ingredient: string, synonyms: string[]): 'ingredientPrefix' | 'genericDescriptors' | undefined {
  const folded = foldBrand(name);
  if ([ingredient, ...synonyms].map(foldBrand).filter(Boolean).some(n => folded.startsWith(n))) return 'ingredientPrefix';
  if (!folded || folded.split(' ').every(w => genericWords.has(w))) return 'genericDescriptors';
}
export function cleanBrands(entry: CatalogEntry) {
  const counts = { ingredientPrefix: 0, genericDescriptors: 0, merged: 0, titleCased: 0 };
  const combined = new Map<string, CatalogEntry['brands'][number]>();
  for (const brand of entry.brands) {
    const reason = brandRemoval(brand.name, entry.name, entry.synonyms);
    if (reason) { counts[reason]++; continue; }
    const key = foldBrand(brand.name), previous = combined.get(key);
    const mixed = (name: string) => /[a-z]/.test(name) && /[A-Z]/.test(name);
    if (previous) {
      counts.merged++;
      if (mixed(brand.name) && !mixed(previous.name)) previous.name = brand.name;
      previous.markets = [...new Set([...previous.markets, ...brand.markets])].sort();
    } else combined.set(key, { name: brand.name, markets: [...new Set(brand.markets)].sort() });
  }
  entry.brands = [...combined.values()].map(brand => {
    if (brand.name === brand.name.toUpperCase() && /[A-Z]/.test(brand.name)) {
      if (!entry.synonyms.includes(brand.name)) entry.synonyms.push(brand.name);
      brand.name = brand.name.toLowerCase().replace(/(^|[^\p{L}])\p{L}/gu, c => c.toUpperCase());
      counts.titleCased++;
    }
    return brand;
  }).sort((a,b) => a.name.localeCompare(b.name, 'en'));
  entry.synonyms = [...new Set(entry.synonyms)].sort();
  return counts;
}
// Audit original bytes before the international adapter parses them. Its legacy
// UTF-8/1252 decoder yields the same text for these explicitly validated inputs.
async function auditSourceEncodings() {
  const results: { source: string; charset: string; bytes: number }[] = [];
  for (const source of ['fr', 'frpa', 'it', 'itpa', 'ca', 'caai', 'cast', 'no', 'ndc', 'ndcbulk', ...Array.from({ length: 13 }, (_, i) => `dsld${i}`)]) {
    const raw = gunzipSync(await readFile(`data/raw/m71/${source}.gz`));
    const files = source === 'no' || source === 'ndcbulk' ? unzip(raw) : [raw];
    const charset = source === 'fr' || source === 'frpa' ? 'windows-1252' : 'utf-8';
    for (const bytes of files) {
      const text = decodeSource(bytes, charset);
      if (source === 'no' && !/^<\?xml[^>]*encoding="utf-8"/i.test(text)) throw new Error('Unexpected FEST XML encoding');
      results.push({ source, charset, bytes: bytes.length });
    }
  }
  return results;
}
// Conservative candidates only. A transformation never creates an entry without an exact RxNorm IN match.
export function latinCandidates(value: string): string[] {
  const original = normalize(value);
  const stem = original.replace(/\b(hydrochloridum|hydrobromidum|natricum|natrium|natrii|kalium|kalicum|potassium|maleas|fumaras|succinas|sulfas|sulphate|phosphas|citras|tartras|besilas|besylas|mesilas|hydrogenotartras|dihydrochloridum|monohydricum|dihydricum|trihydricum|hydricum|acetas|lactas|chloridum)\b/g, '').replace(/\s+/g, ' ').trim();
  const values = new Set([original, stem]);
  for (const s of [original, stem]) {
    values.add(s.replace(/um$/, '')); values.add(s.replace(/um$/, 'e')); values.add(s.replace(/i$/, 'e')); values.add(s.replace(/i$/, ''));
    if (s.startsWith('acidum ')) { const acid = s.slice(7).replace(/icum$/, 'ic'); values.add(acid + ' acid'); }
  }
  return [...values];
}
async function parallel<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []; let index = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (index < items.length) { const i = index++; results[i] = await work(items[i]); } }));
  return results;
}
async function main() {
  await mkdir(`${root}/rxnav`, { recursive: true }); await mkdir('artifacts', { recursive: true });
  let raw: string;
  try { raw = decodeSource(gunzipSync(await readFile(`${root}/rpl.csv.gz`)), 'utf-8'); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    raw = await cached(`${root}/rpl.csv`, rplUrl);
    await writeFile(`${root}/rpl.csv.gz`, gzipSync(raw));
  }
  recordInput(`${root}/rpl.csv.gz`, rplUrl, raw);
  const all = allSchema.parse(JSON.parse(await cached(`${root}/rxnav/ingredients.json`, rxBase + 'allconcepts.json?tty=IN'))).minConceptGroup.minConcept;
  const byName = new Map(all.map(c => [normalize(c.name), c]));
  const byId = new Map(all.map(c => [c.rxcui, c]));
  const overrides = overridesSchema.parse(JSON.parse(await readFile('data/catalog-overrides.json', 'utf8'))).entries;
  for (const override of overrides) {
    const c = byName.get(override.ingredient); if (!c) throw new Error(`Override IN absent: ${override.ingredient}`);
    for (const synonym of override.synonyms) byName.set(normalize(synonym), c);
  }
  const [header, ...rows] = parseCsv(raw);
  const field = (row: string[], name: string) => row[header.indexOf(name)] ?? '';
  const groups = new Map<string, { products: Set<string>; names: Set<string> }>();
  const brandRegistrations = new Map<string, Set<string>>();
  let excluded = 0;
  for (const row of rows) {
    const name = field(row, 'Nazwa powszechnie stosowana');
    const atc = field(row, 'Kod ATC');
    if (field(row, 'Rodzaj preparatu') !== 'Ludzki' || !name || /\+|złożon|homeopat|vaccin|szczepion|allergen|alergen|immunoglobulin|albumin|osocze|plasma|blood|krew|radionucl/i.test(name) || /\b(?:J07|V01|V08|V09|V10|B05A|B02BD|J06)/.test(atc) || /\+/.test(field(row, 'Substancja czynna'))) { excluded++; continue; }
    const group = groups.get(name) ?? { products: new Set<string>(), names: new Set<string>() };
    group.products.add(field(row, 'Identyfikator Produktu Leczniczego'));
    const brand = field(row, 'Nazwa Produktu Leczniczego').replace(/\s+\d.*$/, '').trim();
    const registrations = brandRegistrations.get(brand) ?? new Set<string>();
    registrations.add(field(row, 'Identyfikator Produktu Leczniczego')); brandRegistrations.set(brand, registrations);
    group.names.add(brand); groups.set(name, group);
  }
  const mapped = new Map<string, { products: Set<string>; synonyms: Set<string>; brands: Set<string> }>();
  const unmapped: { name: string; products: number; reason: string }[] = [];
  // Never accept fuzzy-only approximateTerm matches: spelling similarity is not chemical identity.
  for (const [name, group] of groups) {
    const matches = new Map(latinCandidates(name).flatMap(s => { const c = byName.get(s); return c ? [[c.rxcui, c] as const] : []; }));
    if (matches.size !== 1) { unmapped.push({ name, products: group.products.size, reason: matches.size ? 'ambiguous exact IN candidates' : 'no exact IN after Latin/salt rules' }); continue; }
    const c = [...matches.values()][0];
    const entry = mapped.get(c.rxcui) ?? { products: new Set(), synonyms: new Set(), brands: new Set() };
    group.products.forEach(p => entry.products.add(p)); entry.synonyms.add(name); group.names.forEach(n => entry.brands.add(n)); mapped.set(c.rxcui, entry);
  }
  const ranked = [...mapped].sort((a, b) => b[1].products.size - a[1].products.size || a[0].localeCompare(b[0]));
  const selected = new Set(ranked.slice(0, target).map(([id]) => id));
  for (const s of substances) if (s.rxcui && byId.has(s.rxcui)) selected.add(s.rxcui);
  for (const o of overrides) { const c = byName.get(o.ingredient); if (c) selected.add(c.rxcui); }
  await parallel([...selected], async id => {
    const c = byId.get(id); if (!c) throw new Error(`Unknown IN ${id}`);
    const found = z.object({ idGroup: z.object({ rxnormId: z.array(z.string()).optional() }) }).parse(await rx(`rxcui.json?name=${encodeURIComponent(c.name)}&search=0`));
    if (!found.idGroup.rxnormId?.includes(id)) throw new Error(`IN exact search did not confirm ${c.name}`);
  });
  const usBrands = new Map<string, string[]>();
  async function brands(id: string) {
    if (usBrands.has(id)) return usBrands.get(id) ?? [];
    const result = relatedSchema.parse(await rx(`Prescribe/rxcui/${id}/related.json?tty=BN%20SBD`));
    const groups = result.relatedGroup.conceptGroup ?? [];
    // Prescribable vocabulary excludes veterinary-only products. Require a single-ingredient branded drug,
    // because an ingredient's direct BN relationships also include combination brands.
    const singleBrands = new Set(groups.filter(g => g.tty === 'SBD').flatMap(g => g.conceptProperties ?? [])
      .filter(c => !c.name.includes(' / ')).flatMap(c => c.name.match(/\[([^\]]+)\]$/)?.[1] ?? []));
    const names = [...new Set(groups.filter(g => g.tty === 'BN').flatMap(g => g.conceptProperties?.map(c => c.name) ?? []).filter(n => singleBrands.has(n)))].sort();
    usBrands.set(id, names); return names;
  }
  await parallel([...selected], brands);
  console.info(`Mapped ${mapped.size} PL ingredients; fetching US supplement`);
  // Prescribable IN list excludes non-drug chemicals present in allconcepts. Skip biologic/diagnostic classes lexically too.
  const prescribable = allSchema.parse(await rx('Prescribe/allconcepts.json?tty=IN')).minConceptGroup.minConcept.sort((a,b) => a.name.localeCompare(b.name, 'en'));
  const excludedName = /vaccin|virus|bacter|allergen|pollen|extract|globulin|albumin|plasma|blood|factor (?:v|i)|technetium|iodine i|indium in|gallium ga|radium ra|lutetium lu|fludeoxyglucose|gad[oae]|iohexol|iopamidol|iopromide|ioversol/i;
  for (let i = 0; selected.size < target && i < prescribable.length; i += 24) {
    const batch = prescribable.slice(i, i + 24).filter(c => !selected.has(c.rxcui) && !excludedName.test(c.name) && /^[a-z][a-z -]+$/i.test(c.name));
    for (const { c, names } of await parallel(batch, async c => ({ c, names: await brands(c.rxcui) }))) {
      if (selected.size < target && names.length >= minimumUSBrands) selected.add(c.rxcui);
    }
    if (i % 240 === 0) console.info(`US supplement: ${selected.size}/${target}`);
  }
  const catalog: CatalogEntry[] = [];
  for (const id of selected) {
    const c = byId.get(id); if (!c) throw new Error(`Unknown IN ${id}`);
    const ingredient = c.name.toLowerCase();
    const curated = substances.find(s => s.id === ingredient.replace(/[^a-z0-9]+/g, '-'));
    const manual = overrides.find(o => o.ingredient === ingredient);
    const pl = mapped.get(id);
    const combined = new Map<string, CatalogEntry['brands'][number]>();
    function add(name: string, markets: CatalogEntry['brands'][number]['markets']) { const key = normalize(name); const b = combined.get(key) ?? { name, markets: [] }; for (const m of markets) if (!b.markets.includes(m)) b.markets.push(m); b.markets.sort(); combined.set(key, b); }
    for (const name of (await brands(id)).slice(0, 6)) add(name, ['US']);
    for (const name of [...(pl?.brands ?? [])].sort((a,b) => (brandRegistrations.get(b)?.size ?? 0) - (brandRegistrations.get(a)?.size ?? 0) || a.localeCompare(b, 'en')).slice(0, 8)) add(name, ['PL']);
    for (const b of manual?.brands ?? []) add(b.name, b.markets);
    catalog.push({ id: ingredient.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: c.name[0].toUpperCase() + c.name.slice(1), synonyms: [...new Set([...(pl?.synonyms ?? []), ...(manual?.synonyms ?? [])])].filter(n => normalize(n) !== ingredient).sort(), brands: [...combined.values()].sort((a,b) => a.name.localeCompare(b.name, 'en')), ...(curated ? { substanceId: curated.id } : {}), rxcui: id, labelUrl: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(c.name)}` });
  }
  const encodings = await auditSourceEncodings();
  await international(catalog, byName, latinCandidates, parseCsv);
  const beforeBrands = catalog.reduce((n, e) => n + e.brands.length, 0);
  // Reviewed substances retain all source-confirmed single-ingredient US brands.
  // Previously lexical and NDC-frequency caps could evict familiar brands.
  let restoredReviewedUS = 0;
  for (const entry of catalog) {
    if (!entry.substanceId || !entry.rxcui) continue;
    for (const name of await brands(entry.rxcui)) {
      entry.brands.push({ name, markets: ['US'] }); restoredReviewedUS++;
    }
  }
  const hygiene = { ingredientPrefix: 0, genericDescriptors: 0, merged: 0, titleCased: 0 };
  for (const entry of catalog) {
    const counts = cleanBrands(entry);
    for (const key of ['ingredientPrefix', 'genericDescriptors', 'merged', 'titleCased'] satisfies (keyof typeof hygiene)[]) hygiene[key] += counts[key];
  }
  await writeFile('artifacts/M7.2-quality.json', JSON.stringify({ encodings, beforeBrands, restoredReviewedUS, hygiene, afterBrands: catalog.reduce((n,e) => n+e.brands.length,0) }, null, 2)+'\n');
  catalog.sort((a,b) => a.id.localeCompare(b.id, 'en'));
  if (new Set(catalog.map(c => c.id)).size !== catalog.length) throw new Error('Duplicate catalog ids');
  const output = JSON.stringify(catalog);
  assertCleanEncoding(output);
  console.info('Candidate bytes', Buffer.byteLength(output));
  if (Buffer.byteLength(output) >= 700000) throw new Error('Catalog exceeds 700 KB payload budget');
  await writeFile('data/catalog.json', output);
  await writeFile(`${root}/manifest.json`, JSON.stringify([...inputs.values()].sort((a,b) => a.file.localeCompare(b.file, 'en')), null, 2) + '\n');
  unmapped.sort((a,b) => b.products - a.products || a.name.localeCompare(b.name, 'en'));
  await writeFile('artifacts/M7-unmapped.json', JSON.stringify(unmapped, null, 2) + '\n');
  const markets = Object.fromEntries((['US','CA','NO','PL','FR','IT','ES','EU'] as const).map(market => [market, { ingredients: catalog.filter(c => c.brands.some(b => b.markets.includes(market))).length, brands: catalog.reduce((n,c) => n+c.brands.filter(b => b.markets.includes(market)).length,0) }]));
  const stats = { markets, medicines: catalog.filter(c => c.kind !== 'supplement').length, supplements: catalog.filter(c => c.kind === 'supplement').length, ingredients: catalog.length, reviewed: catalog.filter(c => c.substanceId).length, usBrands: catalog.reduce((n,c) => n+c.brands.filter(b => b.markets.includes('US')).length,0), euBrands: catalog.reduce((n,c) => n+c.brands.filter(b => b.markets.includes('EU')).length,0), unmapped: unmapped.length, mappedPL: mapped.size, excludedProducts: excluded, bytes: Buffer.byteLength(output), rplSha256: createHash('sha256').update(raw).digest('hex') };
  await writeFile('artifacts/M7.2-catalog-counts.json', JSON.stringify(stats, null, 2)+'\n'); console.info(stats);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
