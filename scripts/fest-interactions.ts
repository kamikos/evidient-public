import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { unzip } from './catalog-international';
import { substances } from '../data/substances';
import { edges } from '../data/edges';

const repeated = new Set(['RefVirkestoff', 'SortertVirkestoffMedStyrke', 'Substansgruppe', 'Referanse', 'Visningsregel']);
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false,
  trimValues: false, isArray: (name, path) => repeated.has(name) || (typeof path === 'string' && path.endsWith('Substansgruppe.Substans')) });
const code = z.object({ '@_V': z.string(), '@_DN': z.string().optional() });
const refs = z.array(z.string()).default([]);
const substance = z.object({ Id: z.string(), Navn: z.string(), NavnEngelsk: z.string().optional(), RefVirkestoff: refs });
const strength = z.object({ Id: z.string(), RefVirkestoff: z.array(z.string()).length(1) });
const item = z.object({ Substans: z.string(), Atc: code.optional(), RefVirkestoff: refs });
const group = z.object({ Navn: z.string().optional(), Substans: z.array(item).min(1) });
const interaction = z.object({ Id: z.string(), Relevans: code, KliniskKonsekvens: z.string(),
  Situasjonskriterium: z.string().optional(), Interaksjonsmekanisme: z.string().optional(), Kildegrunnlag: code,
  Referanse: z.array(z.object({ Kilde: z.string(), Lenke: code.optional() })).default([]),
  Visningsregel: z.array(code).default([]), Substansgruppe: z.tuple([group, group]) });
const entry = z.object({ OppfInteraksjon: z.object({ Id: z.string(), Tidspunkt: z.string(), Status: code,
  Interaksjon: interaction.optional(), InteraksjonIkkeVurdert: z.object({ Atc: code }).optional() }) });
const catalogSchema = z.array(z.object({ id: z.string(), name: z.string(), synonyms: z.array(z.string()), rxcui: z.string().optional() }));
type Catalog = z.infer<typeof catalogSchema>;
type Ingredient = z.infer<typeof substance>;
const fold = (s: string) => s.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const label = (c: z.infer<typeof code>) => ({ code: c['@_V'], label: c['@_DN'] ?? null });

function* records(xml: string, tag: string) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'g');
  for (const match of xml.matchAll(pattern)) yield parser.parse(match[0]);
}

export function referenceIds(text: string, url: string | null) {
  const source = `${url ?? ''} ${text}`;
  return {
    pmids: sorted([...source.matchAll(/(?:pubmed\/(?:\?term=)?|pubmed\.ncbi\.nlm\.nih\.gov\/|PMID\s*:\s*)(\d+)/gi)].map(m => m[1])),
    dois: sorted([...source.matchAll(/10\.\d{4,9}\/[^\s<>"]+/gi)].map(m => m[0].replace(/[.,;)]*$/, ''))),
  };
}

export function extractFest(xml: string, catalog: Catalog) {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`Invalid FEST XML: ${JSON.stringify(validation)}`);
  const hentetDato = xml.match(/<HentetDato>([^<]+)<\/HentetDato>/)?.[1];
  if (!hentetDato) throw new Error('Missing HentetDato');
  const ingredients = new Map<string, Ingredient>();
  const strengths = new Map<string, string>();
  for (const raw of records(xml, 'OppfVirkestoff')) {
    const row = z.object({ OppfVirkestoff: z.object({ Status: code, Virkestoff: substance.optional(), VirkestoffMedStyrke: strength.optional() }) }).parse(raw).OppfVirkestoff;
    if (row.Status['@_V'] !== 'A') continue;
    if (row.Virkestoff) ingredients.set(row.Virkestoff.Id, row.Virkestoff);
    if (row.VirkestoffMedStyrke) strengths.set(row.VirkestoffMedStyrke.Id, row.VirkestoffMedStyrke.RefVirkestoff[0]);
  }
  const atcIngredients = new Map<string, Set<string>>();
  const product = z.object({ Atc: code.optional(), SortertVirkestoffMedStyrke: z.array(z.object({ RefVirkestoffMedStyrke: z.string() })).default([]) });
  for (const raw of records(xml, 'OppfLegemiddelMerkevare')) {
    const row = z.object({ OppfLegemiddelMerkevare: z.object({ Status: code, LegemiddelMerkevare: product.optional() }) }).parse(raw).OppfLegemiddelMerkevare;
    const p = row.LegemiddelMerkevare;
    if (row.Status['@_V'] !== 'A' || !p?.Atc) continue;
    const ids = p.SortertVirkestoffMedStyrke.map(s => strengths.get(s.RefVirkestoffMedStyrke));
    // Combination products cannot establish a single-substance ATC identity.
    if (ids.length === 0 || ids.some(id => !id) || new Set(ids).size !== 1) continue;
    for (const id of ids) if (id) {
      const set = atcIngredients.get(p.Atc['@_V']) ?? new Set<string>();
      set.add(id); atcIngredients.set(p.Atc['@_V'], set);
    }
  }
  const byName = new Map<string, Set<string>>();
  for (const c of catalog) for (const n of [c.name, ...c.synonyms]) {
    const set = byName.get(fold(n)) ?? new Set<string>(); set.add(c.id); byName.set(fold(n), set);
  }
  const byNorwegian = new Map<string, Set<string>>();
  for (const s of ingredients.values()) {
    const set = byNorwegian.get(fold(s.Navn)) ?? new Set<string>(); set.add(s.Id); byNorwegian.set(fold(s.Navn), set);
  }
  function lineage(id: string, seen = new Set<string>()): Ingredient[] {
    if (seen.has(id)) throw new Error(`Cyclic FEST substance reference: ${id}`);
    const s = ingredients.get(id); if (!s) return [];
    return [s, ...s.RefVirkestoff.flatMap(ref => lineage(ref, new Set([...seen, id])))];
  }
  function englishMatches(id: string): string[] {
    const s = ingredients.get(id);
    if (!s) return [];
    const own = s.NavnEngelsk ? [...(byName.get(fold(s.NavnEngelsk)) ?? [])] : [];
    if (own.length) return own;
    const parents = s.RefVirkestoff.map(englishMatches);
    return parents.some(p => p.length === 0) ? [] : sorted(parents.flat());
  }
  function mapSubstance(s: z.infer<typeof item>) {
    const atc = s.Atc?.['@_V'] ?? null;
    const concrete = atc === null || /^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(atc);
    let basis = 'FEST RefVirkestoff';
    let ids = s.RefVirkestoff;
    if (atc) {
      basis = 'exact ATC via single-ingredient FEST products';
      ids = [...(atcIngredients.get(atc) ?? [])];
      if (!ids.length && concrete) {
        basis = 'exact ATC substance label to FEST Navn';
        ids = [...(byNorwegian.get(fold(s.Substans)) ?? [])];
      }
    }
    const candidates = ids.map(id => {
      const chain = lineage(id);
      const names = sorted(chain.flatMap(i => i.NavnEngelsk ? [i.NavnEngelsk] : []));
      // Resolve the closest English substance identity first, then explicit FEST parent links.
      const matches = englishMatches(id);
      return { festId: id, lineageFestIds: chain.map(i => i.Id), englishNames: names, catalogIds: sorted(matches) };
    });
    const matches = sorted(candidates.flatMap(c => c.catalogIds));
    const mapped = concrete && candidates.length > 0 && candidates.every(c => c.catalogIds.length === 1) && matches.length === 1;
    const catalogId = mapped ? matches[0] : null;
    return { name: s.Substans, atc, refVirkestoff: s.RefVirkestoff, candidates, mappingBasis: basis,
      catalogId, rxcui: catalog.find(c => c.id === catalogId)?.rxcui ?? null,
      unmappedReason: mapped ? null : !concrete ? 'class or synthetic ATC; no expansion' : !candidates.length ? 'no FEST substance identity' : 'missing or ambiguous exact English catalogue identity' };
  }
  const interactions = [];
  const notAssessed = [];
  for (const raw of records(xml, 'OppfInteraksjon')) {
    const row = entry.parse(raw).OppfInteraksjon;
    if (row.Status['@_V'] !== 'A') throw new Error('Snapshot contains inactive interaction; review refresh policy');
    const i = row.Interaksjon;
    if (!i) {
      if (!row.InteraksjonIkkeVurdert) throw new Error(`Missing interaction variant: ${row.Id}`);
      notAssessed.push({ entryId: row.Id, atc: label(row.InteraksjonIkkeVurdert.Atc), hentetDato }); continue;
    }
    if (row.InteraksjonIkkeVurdert) throw new Error('Conflicting interaction variants');
    const sides = i.Substansgruppe.map(g => ({ name: g.Navn ?? null, substances: g.Substans.map(mapSubstance) }));
    const pairs: string[] = [];
    for (const a of sides[0].substances) for (const b of sides[1].substances) {
      if (a.catalogId && b.catalogId && a.catalogId !== b.catalogId) pairs.push([a.catalogId, b.catalogId].sort().join('__'));
    }
    interactions.push({ id: i.Id, entryId: row.Id, recordIdentifier: `urn:fest:Interaksjon:${i.Id}`,
      sourceUrl: 'https://www.dmp.no/globalassets/documents/om-oss/distribusjon-av-legemiddeldata/fest/festfiler/fest251.zip',
      hentetDato, recordTimestamp: row.Tidspunkt, language: 'nb', substances: sides, pairs: sorted(pairs),
      fullyMapped: sides.every(g => g.substances.every(s => s.catalogId !== null)), relevance: label(i.Relevans),
      clinicalConsequence: i.KliniskKonsekvens, mechanism: i.Interaksjonsmekanisme ?? null,
      situationalCriterion: i.Situasjonskriterium ?? null, sourceBasis: label(i.Kildegrunnlag),
      displayRules: i.Visningsregel.map(label), references: i.Referanse.map(r => {
        const url = r.Lenke?.['@_V'] ?? null;
        return { text: r.Kilde, url, ...referenceIds(r.Kilde, url) };
      }) });
  }
  interactions.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  notAssessed.sort((a, b) => a.entryId.localeCompare(b.entryId, 'en'));
  return { hentetDato, interactions, notAssessed };
}

export function build() {
  const manifest = z.array(z.object({ file: z.string(), sha256: z.string(), storedSha256: z.string() })).parse(JSON.parse(readFileSync('data/raw/fest/manifest.json', 'utf8')));
  for (const input of manifest) {
    const stored = readFileSync(input.file);
    if (sha256(stored) !== input.storedSha256 || sha256(gunzipSync(stored)) !== input.sha256) throw new Error(`Source hash mismatch: ${input.file}`);
  }
  const zip = gunzipSync(readFileSync('data/raw/fest/fest251.zip.gz'));
  const files = unzip(zip);
  if (files.length !== 1) throw new Error('Expected one FEST XML file');
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(files[0]);
  const catalogBytes = readFileSync('data/catalog.json');
  const catalog = catalogSchema.parse(JSON.parse(catalogBytes.toString('utf8')));
  // Alcohol is a curated catalogue identity and is absent from the medicine-only registry JSON.
  for (const s of substances) if (!catalog.some(c => c.id === s.id)) catalog.push({ id: s.id, name: s.name, synonyms: s.aliases, rxcui: s.rxcui });
  const result = extractFest(xml, catalog);
  const pairs = new Set(result.interactions.flatMap(i => i.pairs));
  const reviewed = sorted(edges.map(e => e.pair));
  const batchBytes = readFileSync('data/batch/pairs-final.json');
  const batch = z.array(z.object({ pair: z.string() })).parse(JSON.parse(batchBytes.toString('utf8'))).map(p => p.pair);
  const counts = (values: string[]) => Object.fromEntries(sorted(values).map(v => [v, values.filter(x => x === v).length]));
  const stats = { hentetDato: result.hentetDato, catalogSha256: sha256(catalogBytes), curatedSubstancesSha256: sha256(readFileSync('data/substances.ts')), reviewedEdgesSha256: sha256(readFileSync('data/edges.ts')), xmlSha256: sha256(files[0]),
    catalogueEntries: result.interactions.length + result.notAssessed.length, records: result.interactions.length,
    notAssessed: result.notAssessed.length, fullyMappedRecords: result.interactions.filter(i => i.fullyMapped && i.pairs.length).length,
    recordsWithPairs: result.interactions.filter(i => i.pairs.length).length, distinctPairs: pairs.size,
    alcoholPairCount: [...pairs].filter(p => p.split('__').includes('alcohol')).length,
    alcoholPairs: [...pairs].filter(p => p.split('__').includes('alcohol')).sort(),
    relevanceGrades: counts(result.interactions.map(i => `${i.relevance.code}: ${i.relevance.label}`)),
    reviewed: { file: 'data/edges.ts', total: reviewed.length, overlapCount: reviewed.filter(p => pairs.has(p)).length, overlap: reviewed.filter(p => pairs.has(p)), missing: reviewed.filter(p => !pairs.has(p)) },
    batch: { file: 'data/batch/pairs-final.json', sha256: sha256(batchBytes), total: batch.length, overlapCount: batch.filter(p => pairs.has(p)).length, overlap: batch.filter(p => pairs.has(p)) },
    unmappedOccurrences: result.interactions.flatMap(i => i.substances.flatMap(g => g.substances)).filter(s => s.catalogId === null).length };
  const unmapped = new Map<string, unknown>();
  for (const i of result.interactions) for (const g of i.substances) for (const s of g.substances) if (!s.catalogId) unmapped.set(JSON.stringify(s), s);
  mkdirSync('data/sources/fest', { recursive: true });
  for (const [name, data] of Object.entries({ interactions: result.interactions, 'not-assessed': result.notAssessed, unmapped: [...unmapped.values()], stats })) {
    const json = name === 'interactions' && Array.isArray(data) ? '[\n' + data.map(row => JSON.stringify(row)).join(',\n') + '\n]' : JSON.stringify(data, null, 2);
    writeFileSync(`data/sources/fest/${name}.json`, json + '\n');
  }
  return stats;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/fest-interactions.ts')) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
