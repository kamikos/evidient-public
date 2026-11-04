import { describe, expect, it } from 'vitest';
import { emaSections } from './ema-smpc';
import { hash, sentences } from './batch-io';
import { readFileSync } from 'node:fs';
import type { EvidenceRecord } from '../shared/contract';
import { computeSignal } from '../server/agent/derive';

describe('EMA PDF section extraction', () => {
  it('preserves decimal-containing sentences in compact packets', () => {
    expect(sentences('Exposure increased 2.9 fold. Next sentence.')).toEqual(['Exposure increased 2.9 fold.', 'Next sentence.']);
  });
  const warning = 'Special warnings and precautions for use\n' + 'Warning context. '.repeat(10);
  const interaction = 'Interaction with other medicinal products and other forms of interaction\nThe effect of ethanol was studied. ' + 'Interaction context. '.repeat(10);
  it('keeps the first formulation and excludes page numbers and section 4.6', () => {
    const text = `ANNEX I\n4.4 ${warning}\n12\n\f4.5 ${interaction}\n4.6 Fertility, pregnancy and lactation\nExcluded.\n4.4 ${warning}\n4.5 ${interaction}\n4.6 Fertility`;
    const sections = emaSections(text, 'https://www.ema.europa.eu/example.pdf');
    expect(sections.map(s => s.section)).toEqual(['4.4', '4.5']);
    expect(sections[1].text).toContain('The effect of ethanol was studied.');
    expect(sections[0].text).not.toContain('12');
    expect(sections[1].text).not.toContain('Excluded');
    expect(sections[1].sha256).toBe(hash(sections[1].text));
  });
  it('rejects absent and incomplete boundaries instead of guessing', () => {
    expect(() => emaSections(`4.4 ${warning}\n4.5 ${interaction}`, 'url')).toThrow();
    expect(() => emaSections('4.4 navigation\n4.5 navigation\n4.6 navigation', 'url')).toThrow();
  });
});

describe('judged EMA evidence', () => {
  const pairs = ['abacavir__alcohol', 'alcohol__daridorexant', 'alcohol__perampanel', 'alcohol__varenicline', 'alcohol__midazolam', 'alcohol__pregabalin', 'lorazepam__pregabalin', 'abiraterone__dextromethorphan'];
  for (const pair of pairs) {
    it(`ships the independently supported EU quote for ${pair}`, () => {
      const { card }: EvidenceRecord = JSON.parse(readFileSync(`data/batch/evidence/${pair}.json`, 'utf8'));
      expect(card.origin).toBe('batch');
      expect(card.claims.find(c => c.id === 'cEU1')).toMatchObject({ accepted: true, support: 'supports', quoteCheck: 'matched', judgeModel: 'claude-opus-5-5' });
      expect(card.signal).toEqual(computeSignal(card));
      expect(card.signal?.level).toBe(pair === 'abacavir__alcohol' ? 'label_no_interaction' : 'label_mentions');
      if (pair === 'abacavir__alcohol') {
        expect(card.headline.text).toContain('not considered clinically significant');
        expect(card.claims.find(c => c.id === 'cEU1')?.quote).toContain('These findings are not considered clinically significant.');
      }
      if (pair === 'alcohol__pregabalin') {
        expect(card.claims.filter(c => c.source.kind === 'fda_label' && c.accepted)).toHaveLength(3);
        expect(card.reported.some(s => s.claimIds.includes('cEU1'))).toBe(true);
      }
    });
  }
});
