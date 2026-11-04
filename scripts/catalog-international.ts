// Source names are read only from registry snapshots. No generated name lists.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync, inflateRawSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import type { CatalogEntry, Market } from '../shared/contract';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const urls: Record<string, string> = {
  fr: 'https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_bdpm.txt',
  frpa: 'https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_COMPO_bdpm.txt',
  it: 'https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv',
  itpa: 'https://drive.aifa.gov.it/farmaci/PA_confezioni.csv',
  ca: 'https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json',
  caai: 'https://health-products.canada.ca/api/drug/activeingredient/?lang=en&type=json',
  cast: 'https://health-products.canada.ca/api/drug/status/?lang=en&type=json',
  no: 'https://www.dmp.no/globalassets/documents/om-oss/distribusjon-av-legemiddeldata/fest/festfiler/fest251.zip',
  ndc: 'https://api.fda.gov/download.json',
  ndcbulk: 'https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip',
};
// ZIP entries use central-directory sizes, including archives with data descriptors.
export function unzip(b: Buffer): Buffer[] {
  const files: Buffer[] = [];
  let end = b.length - 22;
  while (end >= 0 && b.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('ZIP directory missing');
  let pos = b.readUInt32LE(end + 16);
  for (let i = 0; i < b.readUInt16LE(end + 10); i++) {
    if (b.readUInt32LE(pos) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const size = b.readUInt32LE(pos + 20), offset = b.readUInt32LE(pos + 42);
    const start = offset + 30 + b.readUInt16LE(offset + 26) + b.readUInt16LE(offset + 28);
    const data = b.subarray(start, start + size), method = b.readUInt16LE(pos + 10);
    if (method !== 0 && method !== 8) throw new Error('Unsupported ZIP compression');
    files.push(method === 8 ? inflateRawSync(data) : data);
    pos += 46 + b.readUInt16LE(pos + 28) + b.readUInt16LE(pos + 30) + b.readUInt16LE(pos + 32);
  }
  return files;
}
const drug = z.object({ drug_code: z.number(), brand_name: z.string(), class_name: z.string(), number_of_ais: z.string() });
const ai = z.object({ drug_code: z.number(), ingredient_name: z.string() });
const status = z.object({ drug_code: z.number(), status: z.string() });
const ndcSchema = z.object({ results: z.array(z.object({ product_ndc: z.string(), brand_name: z.string().optional(), product_type: z.string(), marketing_end_date: z.string().optional(), active_ingredients: z.array(z.object({ name: z.string() })).optional() })) });
const dsldSchema = z.object({ hits: z.array(z.object({ _source: z.object({ groupId: z.string(), groupName: z.string(), synonyms: z.array(z.string()).default([]) }) })) });

export async function international(catalog: CatalogEntry[], byName: Map<string, { rxcui: string; name: string }>, candidates: (s: string) => string[], csv: (s: string) => string[][]) {
  const policies = z.record(z.string(), z.object({ license: z.string(), terms: z.string(), attribution: z.string(), updated: z.string() })).parse(JSON.parse(await readFile('data/catalog-licenses.json', 'utf8')));
  const manifest: { file: string; url: string; sha256: string; storedSha256: string; retrieved: string; license: string; terms: string; attribution: string; updated: string }[] = [];
  async function raw(key: string) {
    const url = urls[key]; if (!url) throw new Error(`Unknown source ${key}`);
    const file = `data/raw/m71/${key}.gz`;
    let stored: Buffer;
    try { stored = await readFile(file); } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT') || !process.argv.includes('--download')) throw error;
      const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      stored = gzipSync(Buffer.from(await response.arrayBuffer())); await writeFile(file, stored);
    }
    const data = gunzipSync(stored);
    manifest.push({ file, url, sha256: digest(data), storedSha256: digest(stored), retrieved: '2026-11-03', ...policies[key.startsWith('dsld') ? 'DSLD' : key.startsWith('ndc') ? 'US' : key.slice(0,2).toUpperCase()] });
    return data;
  }
  const policyUrls = z.record(z.string(), z.string()).parse(JSON.parse(await readFile('artifacts/M7.1-policy-urls.json', 'utf8')));
  for (const [key,url] of Object.entries(policyUrls)) {
    urls[key] = url;
    const file = `data/raw/m71/${key}.gz`, stored = await readFile(file), data = gunzipSync(stored);
    const policy = policies[key === 'policydsld' ? 'DSLD' : key.slice(-2).toUpperCase()];
    manifest.push({ file, url, sha256: digest(data), storedSha256: digest(stored), retrieved: '2026-11-03', ...policy });
  }
  const index = new Map(catalog.map(c => [c.rxcui, c]));
  const unmapped = new Map<string, { market: Market; name: string; products: number; reason: string }>();
  const counts: Record<string, number> = {};
  const registrations = new Map<string, Map<string, { name: string; products: Set<string> }>>();
  function add(market: Market, product: string, brand: string, ingredient: string) {
    const stripped = norm(ingredient).replace(/\b(?:hydrochloride|hydrochlorhydrate|chlorhydrate|cloridrato|sodique|sodico|sodium|potassique|potassico|hydrobromide|bromhydrate|fumarate|maleate|sulfate|solfato|chloride|cloruro|hydrate|idrato|dihydrate|trihydrate)\b/g, '').replace(/\s+/g, ' ').trim();
    const forms = new Set([...candidates(ingredient), ...candidates(stripped), stripped.replace(/olo$/, 'ol'), stripped.replace(/ina$/, 'ine'), stripped.replace(/ina$/, 'in'), stripped.replace(/ine$/, 'in'), stripped.replace(/ene$/, 'en'), stripped.replace(/a$/, 'e')]);
    const matches = new Set([...forms].flatMap(n => { const c = byName.get(n); return c ? [c.rxcui] : []; }));
    const entry = matches.size === 1 ? index.get([...matches][0]) : undefined;
    if (!entry) {
      const key = market + ':' + ingredient;
      const u = unmapped.get(key) ?? { market, name: ingredient, products: 0, reason: matches.size === 1 ? 'outside selected IN set' : matches.size ? 'ambiguous exact IN' : 'no exact IN after ending/salt rules' };
      u.products++; unmapped.set(key, u); return;
    }
    const name = brand.replace(/\s+\d.*$/, '').trim(); if (!name) return;
    const key = entry.id + ':' + market;
    const group = registrations.get(key) ?? new Map();
    const b = group.get(norm(name)) ?? { name, products: new Set<string>() };
    b.products.add(product); group.set(norm(name), b); registrations.set(key, group);
    if (norm(ingredient) !== norm(entry.name) && !entry.synonyms.some(s => norm(s) === norm(ingredient))) entry.synonyms.push(ingredient);
    counts[market] = (counts[market] ?? 0) + 1;
  }
  const decode = (b: Buffer) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); } };
  const frNames = new Map(decode(await raw('fr')).trim().split(/\r?\n/).map(l => l.split('\t')).filter(r => r[6] === 'Commercialisée').map(r => [r[0], r[1].split(',')[0]]));
  const frIngredients = new Map<string, Set<string>>();
  for (const r of decode(await raw('frpa')).trim().split(/\r?\n/).map(l => l.split('\t'))) {
    if (r[6] !== 'SA') continue;
    const g = frIngredients.get(r[0]) ?? new Set(); g.add(r[3]); frIngredients.set(r[0], g);
  }
  for (const [id, ingredients] of frIngredients) if (ingredients.size === 1 && frNames.has(id)) add('FR', id, frNames.get(id)!, [...ingredients][0]);
  const [ih, ...ir] = csv(decode(await raw('it')));
  const get = (r: string[], k: string) => r[ih.indexOf(k)] ?? '';
  const itIngredients = new Map<string, Set<string>>();
  const [ph, ...pr] = csv(decode(await raw('itpa')));
  for (const r of pr) { const name = r[ph.indexOf('PRINCIPIO_ATTIVO')]; if (!name || /N\.D\.|\+|\//.test(name)) continue; const id = r[ph.indexOf('CODICE_AIC')]; const s = itIngredients.get(id) ?? new Set(); s.add(name); itIngredients.set(id, s); }
  for (const r of ir) { const id = get(r, 'CODICE_AIC'), s = itIngredients.get(id); if (get(r, 'STATO_AMMINISTRATIVO') === 'Autorizzata' && s?.size === 1 && !/\+|\//.test(get(r, 'PA_ASSOCIATI'))) add('IT', id, get(r, 'DENOMINAZIONE'), [...s][0]); }
  const marketed = new Set(z.array(status).parse(JSON.parse((await raw('cast')).toString())).filter(s => s.status === 'Marketed').map(s => s.drug_code));
  const ingredients = new Map<number, Set<string>>();
  for (const a of z.array(ai).parse(JSON.parse((await raw('caai')).toString()))) { const g = ingredients.get(a.drug_code) ?? new Set(); g.add(a.ingredient_name); ingredients.set(a.drug_code, g); }
  for (const d of z.array(drug).parse(JSON.parse((await raw('ca')).toString()))) { const s = ingredients.get(d.drug_code); if (d.class_name === 'Human' && d.number_of_ais === '1' && marketed.has(d.drug_code) && s?.size === 1) add('CA', String(d.drug_code), d.brand_name, [...s][0]); }
  // Parse individual FEST records to avoid constructing the entire 118 MB XML tree.
  const xml = unzip(await raw('no'))[0].toString();
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const substanceSchema = z.object({ Id: z.string(), Navn: z.string(), NavnEngelsk: z.string().optional() });
  const strengthSchema = z.object({ Id: z.string(), RefVirkestoff: z.string() });
  const names = new Map([...xml.matchAll(/<Virkestoff\s[^>]*>[\s\S]*?<\/Virkestoff>/g)].map(m => { const s = substanceSchema.parse(parser.parse(m[0]).Virkestoff); return [s.Id, s.NavnEngelsk || s.Navn] as const; }));
  const strengths = new Map([...xml.matchAll(/<VirkestoffMedStyrke\s[^>]*>[\s\S]*?<\/VirkestoffMedStyrke>/g)].map(m => { const s = strengthSchema.parse(parser.parse(m[0]).VirkestoffMedStyrke); return [s.Id, s.RefVirkestoff] as const; }));
  for (const m of xml.matchAll(/<OppfLegemiddelMerkevare>[\s\S]*?<\/OppfLegemiddelMerkevare>/g)) {
    if (!/<Status V="A"/.test(m[0])) continue;
    const refs = [...m[0].matchAll(/<RefVirkestoffMedStyrke>([^<]+)</g)].map(r => strengths.get(r[1])).filter((s): s is string => Boolean(s));
    const unique = new Set(refs); if (unique.size !== 1 || /Veterin/.test(m[0])) continue;
    const ingredient = names.get([...unique][0]);
    const brand = m[0].match(/<Varenavn>([^<]+)</)?.[1], id = m[0].match(/<Id>([^<]+)</)?.[1];
    if (ingredient && brand && id) add('NO', id, brand, ingredient);
  }
  await raw('ndc');
  for (const file of unzip(await raw('ndcbulk'))) for (const p of ndcSchema.parse(JSON.parse(file.toString())).results) {
    if (!/^HUMAN (?:OTC|PRESCRIPTION) DRUG$/.test(p.product_type) || p.active_ingredients?.length !== 1 || !p.brand_name || (p.marketing_end_date && p.marketing_end_date < '20261103')) continue;
    add('US', p.product_ndc, p.brand_name, p.active_ingredients[0].name);
  }
  // Equal cap for each added registry. Product counts supply the US secondary signal.
  for (const entry of catalog) for (const market of ['US', 'FR', 'IT', 'CA', 'NO'] satisfies Market[]) {
    const group = registrations.get(entry.id + ':' + market);
    for (const b of [...(group?.values() ?? [])].sort((a,b) => b.products.size - a.products.size || a.name.localeCompare(b.name, 'en')).slice(0, 6)) {
      const existing = entry.brands.find(x => norm(x.name) === norm(b.name));
      if (existing) { if (!existing.markets.includes(market)) existing.markets.push(market); }
      else entry.brands.push({ name: b.name, markets: [market] });
    }
    entry.synonyms.sort();
  }
  const { supplementQueries } = z.object({ supplementQueries: z.array(z.string()) }).parse(JSON.parse(await readFile('data/catalog-overrides.json', 'utf8')));
  const supplements = new Map<string, CatalogEntry>();
  for (const [i,q] of supplementQueries.entries()) {
    urls['dsld'+i] = 'https://api.ods.od.nih.gov/dsld/v9/ingredient-groups?method=factsheet&term='+encodeURIComponent(q)+'&size=100';
    const result = dsldSchema.parse(JSON.parse((await raw('dsld'+i)).toString()));
    // Include exact matching ingredient groups only; related multi-ingredient groups are excluded.
    for (const { _source: g } of result.hits.filter(h => norm(h._source.groupName).replace(/[^a-z0-9]/g, '') === norm(q).replace(/[^a-z0-9]/g, ''))) {
      const id = 'supplement-' + norm(g.groupName).replace(/[^a-z0-9]+/g, '-');
      const entry = supplements.get(id) ?? { id, name: g.groupName, kind: 'supplement', synonyms: [], brands: [], labelUrl: 'https://dsld.od.nih.gov/ingredient/'+g.groupId } satisfies CatalogEntry;
      entry.labelUrl = 'https://dsld.od.nih.gov/search?ingredient='+encodeURIComponent(g.groupName);
      entry.synonyms = [...new Set([...entry.synonyms, ...g.synonyms])].filter(s => s.length < 70 && norm(s).includes(norm(g.groupName))).sort((a,b) => a.length-b.length || a.localeCompare(b, 'en')).slice(0,24).sort(); supplements.set(id, entry);
    }
  }
  const manual = z.object({ entries: z.array(z.object({ ingredient: z.string(), brands: z.array(z.object({ name: z.string() })) })) }).parse(JSON.parse(await readFile('data/catalog-overrides.json', 'utf8')));
  for (const entry of catalog) {
    const keep = new Set(manual.entries.find(o => norm(o.ingredient) === norm(entry.name))?.brands.map(b => norm(b.name)) ?? []);
    const retained = new Map<string, CatalogEntry['brands'][number]>();
    for (const market of ['US','PL','FR','IT','CA','NO'] satisfies Market[]) {
      const ranked = entry.brands.filter(b => b.markets.includes(market)).sort((a,b) => {
        const group = registrations.get(entry.id+':'+market);
        return (group?.get(norm(b.name))?.products.size ?? 0) - (group?.get(norm(a.name))?.products.size ?? 0) || a.name.localeCompare(b.name, 'en');
      });
      for (const b of ranked.filter((b,i) => market === 'PL' || i < 6 || keep.has(norm(b.name)))) {
        const current = retained.get(norm(b.name)) ?? { name: b.name, markets: [] };
        current.markets.push(market); retained.set(norm(b.name), current);
      }
    }
    entry.brands = [...retained.values()].sort((a,b) => a.name.localeCompare(b.name, 'en'));
  }
  catalog.push(...supplements.values());
  await writeFile('artifacts/M7.1-unmapped.json', JSON.stringify([...unmapped.values()].sort((a,b) => a.market.localeCompare(b.market) || b.products-a.products || a.name.localeCompare(b.name)), null, 2)+'\n');
  await writeFile('artifacts/M7.1-source-counts.json', JSON.stringify({ matchedProducts: counts, supplements: supplements.size }, null, 2)+'\n');
  await writeFile('data/raw/m71/manifest.json', JSON.stringify(manifest, null, 2)+'\n');
}
