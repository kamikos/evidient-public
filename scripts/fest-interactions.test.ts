import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, extractFest, referenceIds } from './fest-interactions';

const catalog = [
  { id: 'a', name: 'Alpha', synonyms: [], rxcui: '1' },
  { id: 'b', name: 'Beta', synonyms: [], rxcui: '2' },
];
const ingredient = (id: string, name: string, extra = '') => `<OppfVirkestoff><Status V="A"/><Virkestoff><Id>${id}</Id><Navn>${name}</Navn><NavnEngelsk>${name}</NavnEngelsk>${extra}</Virkestoff></OppfVirkestoff>`;
const member = (name: string, identity: string) => `<Substans><Substans>${name}</Substans>${identity}</Substans>`;
const fixture = (left = member('Alpha', '<RefVirkestoff>va</RefVirkestoff>'), extra = '') => `<FEST><HentetDato>2026-10-27T12:25:20</HentetDato><KatVirkestoff>${ingredient('va', 'Alpha')}${ingredient('vb', 'Beta')}${extra}</KatVirkestoff><KatInteraksjon><OppfInteraksjon><Id>entry</Id><Tidspunkt>2026-01-01</Tidspunkt><Status V="A"/><Interaksjon><Id>interaction</Id><Relevans V="2" DN="Forholdsregler bør tas"/><KliniskKonsekvens>  Økt risiko &amp; konsekvens.\n</KliniskKonsekvens><Interaksjonsmekanisme>Mekanisme.</Interaksjonsmekanisme><Situasjonskriterium>Kun ved høy dose.</Situasjonskriterium><Handtering>DO NOT EXPORT THIS ADVICE</Handtering><Kildegrunnlag V="4" DN="Indirekte data"/><Referanse><Kilde>Study</Kilde><Lenke V="https://www.ncbi.nlm.nih.gov/pubmed/?term=12345"/></Referanse><Substansgruppe>${left}</Substansgruppe><Substansgruppe>${member('Beta', '<RefVirkestoff>vb</RefVirkestoff>')}</Substansgruppe></Interaksjon></OppfInteraksjon><OppfInteraksjon><Id>not-assessed</Id><Tidspunkt>2026-01-01</Tidspunkt><Status V="A"/><InteraksjonIkkeVurdert><Atc V="A01AA01" DN="Example"/></InteraksjonIkkeVurdert></OppfInteraksjon></KatInteraksjon></FEST>`;

test('preserves decoded Norwegian text, labels, criteria and references, excluding management', () => {
  const result = extractFest(fixture(), catalog);
  const i = result.interactions[0];
  assert.equal(i.clinicalConsequence, '  Økt risiko & konsekvens.\n');
  assert.equal(i.situationalCriterion, 'Kun ved høy dose.');
  assert.deepEqual(i.pairs, ['a__b']);
  assert.equal(i.fullyMapped, true);
  assert.equal(i.relevance.label, 'Forholdsregler bør tas');
  assert.deepEqual(i.references[0].pmids, ['12345']);
  assert.equal(result.notAssessed.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /Handtering|DO NOT EXPORT/);
});

test('maps exact ATC labels through FEST English names and keeps class ATC unexpanded', () => {
  const left = member('Alpha', '<Atc V="A01AA01"/>') + member('Class', '<Atc V="A01"/>');
  const i = extractFest(fixture(left), catalog).interactions[0];
  assert.deepEqual(i.pairs, ['a__b']);
  assert.equal(i.fullyMapped, false);
  assert.equal(i.substances[0].substances[1].catalogId, null);
});

test('expands only explicit concrete members and rejects ambiguous exact identities', () => {
  const left = member('Alpha', '<RefVirkestoff>va</RefVirkestoff>') + member('Unknown', '<RefVirkestoff>absent</RefVirkestoff>');
  assert.deepEqual(extractFest(fixture(left), catalog).interactions[0].pairs, ['a__b']);
  const ambiguous = [...catalog, { id: 'other', name: 'Alpha', synonyms: [], rxcui: '3' }];
  assert.deepEqual(extractFest(fixture(), ambiguous).interactions[0].pairs, []);
});

test('follows explicit FEST parent references without stripping salt names', () => {
  const left = member('Alpha salt', '<RefVirkestoff>salt</RefVirkestoff>');
  const extra = ingredient('salt', 'Alpha salt', '<RefVirkestoff>va</RefVirkestoff>');
  assert.deepEqual(extractFest(fixture(left, extra), catalog).interactions[0].pairs, ['a__b']);
  assert.throws(() => extractFest(fixture(left, ingredient('salt', 'Alpha salt', '<RefVirkestoff>salt</RefVirkestoff>')), catalog), /Cyclic/);
});

test('expands explicitly listed concrete group members into sorted distinct pairs', () => {
  const extraCatalog = [...catalog, { id: 'c', name: 'Gamma', synonyms: [], rxcui: '3' }];
  const left = member('Alpha', '<RefVirkestoff>va</RefVirkestoff>')
    + member('Gamma', '<RefVirkestoff>vc</RefVirkestoff>');
  const i = extractFest(fixture(left, ingredient('vc', 'Gamma')), extraCatalog).interactions[0];
  assert.deepEqual(i.pairs, ['a__b', 'b__c']);
  assert.equal(i.fullyMapped, true);
});

test('extracts PMID and DOI only when explicit and rejects malformed XML', () => {
  assert.deepEqual(referenceIds('PMID: 123; doi:10.1000/example.', 'https://pubmed.ncbi.nlm.nih.gov/123/'), { pmids: ['123'], dois: ['10.1000/example'] });
  assert.throws(() => extractFest('<FEST>', catalog), /Invalid FEST XML/);
});

test('ATC joins active single-ingredient product strength to FEST substance identity', () => {
  const product = `<OppfVirkestoff><Status V="A"/><VirkestoffMedStyrke><Id>strength</Id><RefVirkestoff>va</RefVirkestoff></VirkestoffMedStyrke></OppfVirkestoff>`;
  const brand = `<KatLegemiddelMerkevare><OppfLegemiddelMerkevare><Status V="A"/><LegemiddelMerkevare><Atc V="A01AA01"/><SortertVirkestoffMedStyrke><RefVirkestoffMedStyrke>strength</RefVirkestoffMedStyrke></SortertVirkestoffMedStyrke></LegemiddelMerkevare></OppfLegemiddelMerkevare></KatLegemiddelMerkevare>`;
  const xml = fixture(member('Different ATC name', '<Atc V="A01AA01"/>'), product).replace('</FEST>', `${brand}</FEST>`);
  const i = extractFest(xml, catalog).interactions[0];
  assert.deepEqual(i.pairs, ['a__b']);
  assert.equal(i.substances[0].substances[0].mappingBasis, 'exact ATC via single-ingredient FEST products');
  const combination = xml.replace('</SortertVirkestoffMedStyrke>', '</SortertVirkestoffMedStyrke><SortertVirkestoffMedStyrke><RefVirkestoffMedStyrke>missing-strength</RefVirkestoffMedStyrke></SortertVirkestoffMedStyrke>');
  assert.deepEqual(extractFest(combination, catalog).interactions[0].pairs, []);
});

test('offline snapshot hashes validate and the real extraction rebuilds byte-identically', () => {
  const names = ['interactions', 'not-assessed', 'unmapped', 'stats'];
  const before = names.map(n => readFileSync(`data/sources/fest/${n}.json`));
  const stats = build();
  for (const [index, name] of names.entries()) assert.deepEqual(readFileSync(`data/sources/fest/${name}.json`), before[index]);
  assert.equal(stats.records, 11159);
  assert.equal(stats.notAssessed, 457);
  assert.equal(stats.reviewed.total, 28);
  assert.equal(stats.batch.file, 'data/batch/pairs-final.json');
  assert(stats.alcoholPairs.length > 0);
  assert.equal(stats.alcoholPairCount, stats.alcoholPairs.length);
  const text = before[0].toString('utf8');
  assert.doesNotMatch(text, /"(?:Handtering|Håndtering|management)"/i);
  assert.doesNotMatch(text, /\uFFFD/);
});
