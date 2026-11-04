import { describe, expect, it } from 'vitest';
import { questions } from './questions';

describe('pharmacist question display names', () => {
  it('uses catalogue names for medicines outside the curated set', () => {
    const text = questions({ a: 'amiodarone', b: 'warfarin', depth: 'human_studies', conflicts: [] }).map(q => q.text).join(' ');
    expect(text).toContain('Amiodarone');
    expect(text).toContain('Warfarin');
    expect(text).not.toMatch(/\bamiodarone\b|\bwarfarin\b/);
  });
  it('places the medicine before drinking alcohol in either pair order', () => {
    for (const [a, b] of [['alcohol', 'amiodarone'], ['amiodarone', 'alcohol']]) {
      const text = questions({ a, b, depth: 'human_studies', conflicts: [] }).map(q => q.text).join(' ');
      expect(text).toContain('taking Amiodarone and drinking alcohol');
    }
  });
});
