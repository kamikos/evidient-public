import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { catalog } from './generated/catalog';
import { searchCatalog } from './catalog-search';
import { identify, mapReadText } from './identify';

it.each([
  ['ibuprofen','ibuprofen'], ['medikinet','methylphenidate'],
  ['ibux','ibuprofen'], ['paracet','acetaminophen'],
  ['doliprane','acetaminophen'], ['tachipirina','acetaminophen'],
])('resolves %s to reviewed %s', (query,id) => {
  const result = searchCatalog(query).results[0];
  expect(result?.id).toBe(id); expect(result?.substanceId).toBe(id);
});
it('retains Canadian marketed single-ingredient products', () => {
  const brand = catalog.find(c => c.id === 'ibuprofen')?.brands.find(b => b.name.toLowerCase() === 'motrin');
  expect(brand?.markets).toContain('CA');
  expect(searchCatalog('MOTRIN').results[0]?.id).toBe('ibuprofen');
});
it('includes the requested DSLD ingredient groups without reviewed links', () => {
  const names = ['whey','creatine','caffeine','melatonin',"st-john-s-wort",'fish-oil','omega-3','vitamin-d','magnesium','ginkgo','ashwagandha','turmeric','curcumin'];
  for (const name of names) {
    const entry = catalog.find(c => c.id === 'supplement-'+name);
    expect(entry?.kind).toBe('supplement'); expect(entry?.substanceId).toBeUndefined();
    expect(entry?.labelUrl).toMatch(/^https:\/\/dsld.od.nih.gov\/search/);
  }
  expect(searchCatalog('whey').results[0]?.kind).toBe('supplement');
  expect(searchCatalog('whey protein isolate').results[0]?.kind).toBe('supplement');
});
it('maps photographed brands, synonyms, doses and diacritics through the full catalog', async () => {
  for (const [text,id] of [['MÉDIKINET 10 mg','methylphenidate'],['APAP','acetaminophen'],['Ibux 400 mg','ibuprofen'],['Concor','bisoprolol'],['whey','supplement-whey']]) expect(mapReadText(text)).toContain(id);
  expect(mapReadText('FLAGYL 500 mg tablets')).toEqual(['metronidazole']);
  expect(mapReadText('notibux')).toEqual([]);
  const result = await identify('AAAA','image/png', async () => ({ id: 'test', output: [], usage: undefined, output_text: JSON.stringify({ reads: [{ readText: 'Ibux', confidence: 'high' }] }) }));
  expect(result).toEqual({ candidates: [{ substanceId: 'ibuprofen', readText: 'Ibux', confidence: 'high' }] });
});
it('keeps the payload below 700 KB and only replaces the label-only question', () => {
  expect(Buffer.byteLength(JSON.stringify(catalog))).toBeLessThan(700000);
  const files = readdirSync('data/evidence').filter((name) => name.endsWith('.json'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) expect(readFileSync(`data/evidence/${file}`,'utf8')).not.toContain('but I found no human studies');
});
