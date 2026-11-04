import { describe, expect, it, vi } from 'vitest';
import { normalize } from './rxnorm';
import { getLabelSections } from './openfda';
import { fetchAbstracts, search } from './pubmed';
import { getSourceText } from './sourceStore';

describe('source APIs', () => {
  it('parses exact RxNorm resolution and ingredient properties', async () => {
    const requests: string[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(url);
      return Response.json(url.includes('/properties.json') ? { properties: { name: 'sertraline' } } : { idGroup: { rxnormId: ['36437'] } });
    });
    try {
      expect(await normalize('sertraline')).toEqual({ rxcui: '36437', name: 'sertraline' });
      expect(requests).toEqual(['https://rxnav.nlm.nih.gov/REST/rxcui.json?name=sertraline', 'https://rxnav.nlm.nih.gov/REST/rxcui/36437/properties.json']);
    } finally { fetchMock.mockRestore(); }
  });
  it('fetches the pinned metronidazole interaction section', async () => {
    const section = (await getLabelSections('metronidazole')).find(s => s.section === 'drug_interactions');
    expect(section?.text).toContain('Alcoholic Beverages');
  });
  it('fetches and parses PubMed abstract and metadata', async () => {
    const [article] = await fetchAbstracts(['12022894']);
    expect(article.pmid).toBe('12022894');
    expect(article.abstractText).toMatch(/metronidazole/i);
    expect(article.title).toMatch(/disulfiram/i);
    expect(article.year).toBe('2002');
    expect(article.firstAuthor).toBe('Visap\u00e4\u00e4');
    expect(article.journal).not.toBe('');
    expect(article.publicationTypes).toContain('Clinical Trial');
  });
  it('searches PubMed', async () => {
    expect(await search('12022894[uid]', 1)).toEqual(['12022894']);
  });
});

it('reads snapshots without a network request', async () => {
  expect(await getSourceText({ kind: 'pubmed', id: '12022894' })).toMatch(/metronidazole/i);
});
