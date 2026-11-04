import { describe, expect, it } from 'vitest';
import { catalog } from './generated/catalog';
import { searchCatalog, normalizeCatalogName } from './catalog-search';
import { GET as getCatalog } from '../app/api/catalog+api';
import { GET as getSearch } from '../app/api/catalog/search+api';
import { substances } from '../data/substances';

describe('registry catalog', () => {
  it.each([
    ['medikinet', 'methylphenidate'], ['ritalin', 'methylphenidate'], ['concerta', 'methylphenidate'],
    ['apap', 'acetaminophen'], ['paracetamol', 'acetaminophen'], ['ibuprom', 'ibuprofen'],
    ['afobam', 'alprazolam'], ['stilnox', 'zolpidem'], ['xanax', 'alprazolam'],
    ['adderall', 'amphetamine'], ['euthyrox', 'levothyroxine'], ['letrox', 'levothyroxine'],
    ['glucophage', 'metformin'], ['concor', 'bisoprolol'],
  ])('resolves %s to %s', (query, id) => {
    expect(searchCatalog(query).results[0]?.id).toBe(id);
  });
  it('links every curated drug and keeps required generic synonyms', () => {
    for (const substance of substances.filter(s => s.kind !== 'alcohol')) {
      expect(catalog.find(e => e.id === substance.id)?.substanceId).toBe(substance.id);
    }
    expect(catalog.find(e => e.id === 'acetaminophen')?.synonyms).toContain('paracetamol');
    expect(catalog.find(e => e.id === 'aspirin')?.synonyms).toContain('acetylsalicylic acid');
    expect(new Set(catalog.map(e => e.id)).size).toBe(catalog.length);
    expect(catalog.find(e => e.id === 'amoxicillin')?.brands.some(b => b.name === 'Augmentin')).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(catalog))).toBeLessThan(700000);
  });
  it('folds Polish diacritics and case, limits results and orders match tiers', () => {
    expect(normalizeCatalogName(' ĄĆĘŁŃÓŚŹŻ ')).toBe('acelnoszz');
    expect(searchCatalog('MeDiKiNeT')).toEqual(searchCatalog('medikinet'));
    expect(searchCatalog('a').results).toHaveLength(12);
    expect(searchCatalog('  ').results).toEqual([]);
    const hits = searchCatalog('metformin').results;
    expect(hits[0].id).toBe('metformin');
    const tiers = hits.map(e => Math.max(...[e.id,e.name,...e.synonyms,...e.brands.map(b => b.name)].map(normalizeCatalogName).map(n => n === 'metformin' ? 3 : n.startsWith('metformin') ? 2 : 1)));
    expect(tiers).toEqual([...tiers].sort((a,b) => b-a));
    const partials = searchCatalog('a').results;
    const scores = partials.map(e => ({ reviewed: Boolean(e.substanceId), tier: Math.max(...[e.id,e.name,...e.synonyms,...e.brands.map(b => b.name)].map(normalizeCatalogName).map(n => n === 'a' ? 3 : n.startsWith('a') ? 2 : 1)) }));
    for (let i = 1; i < scores.length; i++) {
      if (scores[i-1].tier === scores[i].tier && scores[i].reviewed) expect(scores[i-1].reviewed).toBe(true);
    }
  });
  it('serves the full bundled JSON with daily caching and exposes search', async () => {
    const response = getCatalog();
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(await response.json()).toEqual(catalog);
    expect(await getSearch(new Request('https://evidient.test/api/catalog/search?q=apap')).json()).toEqual(searchCatalog('apap'));
  });
});
