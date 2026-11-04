import { describe, it, expect } from 'vitest';
import { audit, judgeUnavailable, budgeted, installTransport } from './batch-common';
import type { EvidenceRecord } from '../shared/contract';
import { unlinkSync, existsSync } from 'node:fs';
import { cached, hash } from './batch-io';
function empty(): EvidenceRecord {
  return { card: { pair: 'a__b', a: 'a', b: 'b', category: 'other', depth: 'limited', origin: 'requested', headline: { text: '', claimIds: [] }, reported: [], mechanism: [], conflicts: [], gaps: [], pharmacistQuestions: [], claims: [], sources: [], generatedAt: '', models: { research: '', judge: '', synth: '' } }, trace: [] };
}
describe('batch shipping gate', () => {
  it('shares concurrent HTTP cache requests for the same URL', async () => {
    const original = globalThis.fetch;
    const url = `https://eutils.ncbi.nlm.nih.gov/cache-test-${process.pid}-${Date.now()}`;
    const file = `data/batch/http/${hash(url)}.json`;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('cached text'); };
    try {
      expect(await Promise.all([cached(url), cached(url)])).toEqual(['cached text', 'cached text']);
      expect(calls).toBe(1);
      expect(await cached(url)).toBe('cached text');
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
      if (existsSync(file)) unlinkSync(file);
    }
  });
  it('recognizes judge outage traces even without rejected claims', () => {
    const r = empty();
    r.trace.push({ type: 'thinking', text: 'Independent judge unavailable for one or more claims', t: 1 });
    expect(judgeUnavailable(r)).toBe(true);
  });
  it('accepts a genuine empty requested result for the separate empty list', async () => {
    expect(await audit(empty())).toEqual([]);
    expect(judgeUnavailable(empty())).toBe(false);
  });
  it('rejects advice, absent reports and invalid citations on a nonempty card', async () => {
    const r = empty();
    r.card.headline = { text: 'You should stop this drug.', claimIds: ['missing'] };
    r.card.claims.push({ id: 'c1', text: 'risk', quote: 'x', source: { kind: 'fda_label', id: 'invalid#drug_interactions' }, stance: 'increases_risk', outcome: 'risk', accepted: true, quoteCheck: 'matched', support: 'supports' });
    expect(await audit(r)).toEqual(expect.arrayContaining(['advice', 'empty reported', 'citations', 'source:c1']));
  });
  it('blocks all model requests before transport even inside a budget scope', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('{}'); };
    installTransport();
    try {
      await expect(fetch('https://api.meta.ai/v1/responses', { method: 'POST', body: '{}' })).rejects.toThrow('Model calls forbidden');
      await expect(budgeted(() => fetch('https://api.meta.ai/v1/responses', { method: 'POST', body: JSON.stringify({ input: 'x'.repeat(12_000_000) }) }))).rejects.toThrow('Model calls forbidden');
      expect(calls).toBe(0);
    } finally { globalThis.fetch = original; }
  });
});
