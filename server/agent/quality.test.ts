import { fakeJudgments } from './judgeFake';
import { describe, expect, it } from 'vitest';
import { stripCitationMarkers, dedupeReported, wordOverlap } from './synthesize';
import { questions } from './questions';
describe('M4.1 card quality', () => {
  it('strips adjacent, spaced and trailing citation markers without losing punctuation', () => {
    for (const text of ['CNS effects [c1].', 'CNS effects [c1][c3].', 'CNS effects [c1] [c3].']) expect(stripCitationMarkers(text)).toBe('CNS effects.');
    expect(stripCitationMarkers('CNS effects [c12]')).toBe('CNS effects');
    expect(stripCitationMarkers('Observed [53%] inhibition.')).toBe('Observed [53%] inhibition.');
  });
  it('keeps the longer supported duplicate and caps distinct reports at three', () => {
    const texts = ['The label describes sedation.', 'The label describes sedation and respiratory depression.', 'A trial measured platelet activity.', 'A cohort reported bleeding.', 'A review found contradictory results.'];
    const sentences = texts.map((text, i) => ({ text, claimIds: [`c${i}`] }));
    const result = dedupeReported(sentences);
    expect(result).toHaveLength(3); expect(result[0].text).toBe(texts[1]);
    expect(result.every((s, i) => result.slice(i + 1).every(other => wordOverlap(s.text, other.text) <= .7))).toBe(true);
  });
  it('uses exact priority and medicine-first alcohol copy', () => {
    const result = questions({ a: 'alcohol', b: 'metronidazole', depth: 'label_only', conflicts: [{ outcome: 'reaction', sideA: ['c1'], sideB: ['c2'], summary: { text: '', claimIds: [] } }] });
    expect(result).toEqual([
      { trigger: 'conflict', text: 'The label and a published study disagree here. Which finding fits my situation better?' },
      { trigger: 'always', text: 'Do any of my other medicines or products, like cough syrup or mouthwash, contain alcohol?' },
      { trigger: 'always', text: 'Does my dose, or the time between taking Metronidazole and drinking alcohol, change how much this matters?' },
    ]);
    expect(questions({ a: 'aspirin', b: 'ibuprofen', depth: 'limited', conflicts: [] })[1].text).toBe('Do any of my other medicines contain Aspirin or Ibuprofen, or work the same way?');
  });
});


import type { Claim } from '../../shared/contract';
import { synthesize, filterSentence } from './synthesize';
import { deriveConflicts } from './derive';
import { wordCount, withinSentenceLimit } from './textQuality';
import { research } from './research';
import { edges } from '../../data/edges';
import { labelSetIds } from '../../data/substances';
import type { Structured } from './runtime';
const claim: Claim = { id: 'c1', text: 'The label describes increased drowsiness with alcohol.', quote: 'Alcohol may increase drowsiness.', source: { kind: 'fda_label', id: 'label#when_using' }, stance: 'increases_risk', outcome: 'drowsiness', accepted: true, quoteCheck: 'matched', support: 'supports' };
const long = Array.from({ length: 41 }, () => 'word').join(' ') + '.';
describe('M4.2 card quality', () => {
  it('counts each sentence and keeps the exact 40 and 25 word boundaries', () => {
    expect(wordCount('  one   two ')).toBe(2);
    expect(withinSentenceLimit(long)).toBe(false);
    expect(withinSentenceLimit(Array(40).fill('word').join(' ') + '. Short sentence.')).toBe(true);
    expect(filterSentence({ text: long, claimIds: ['c1'] }, [claim])).toBeUndefined();
    expect(filterSentence({ text: 'The label states that combined use with alcohol is not recommended.', claimIds: ['c1'] }, [claim])).toBeDefined();
  });
  it('regenerates once for length, then uses the shortest supported claim for headline and empty reports', async () => {
    let calls = 0;
    const generate: Structured = async (_prompt, schema) => { calls++; return schema.parse({ headline: { text: long, claimIds: ['c1'] }, reported: [{ text: long, claimIds: ['c1'] }], mechanism: [], conflicts: [] }); };
    const result = await synthesize([claim, { ...claim, id: 'c2', text: 'Alcohol may increase drowsiness.' }], { structured: generate, judge: async (_prompt, schema) => fakeJudgments(_prompt, schema, itemPrompt => ({ support: 'does_not_support', rationale: 'Rejected synthesis.' })) });
    expect(calls).toBe(2);
    expect(result.headline).toEqual({ text: 'Alcohol may increase drowsiness.', claimIds: ['c2'] });
    expect(result.reported).toEqual([result.headline]);
  });
  it('uses both supported sides when a generated conflict headline remains one-sided after retry', async () => {
    const other: Claim = { ...claim, id: 'c2', text: 'A controlled trial observed no increased drowsiness.', stance: 'no_effect_observed', source: { kind: 'pubmed', id: '123' } };
    let calls = 0;
    const result = await synthesize([claim, other], { structured: async (_prompt, schema) => { calls++; return schema.parse({ headline: { text: claim.text, claimIds: ['c1'] }, reported: [], mechanism: [], conflicts: [] }); }, judge: async (_prompt, schema) => fakeJudgments(_prompt, schema, itemPrompt => ({ support: 'supports', rationale: 'Supported.' })) });
    expect(calls).toBe(2);
    expect(result.headline.claimIds).toEqual(['c1', 'c2']);
    expect(result.headline.text).toContain(other.text);
    expect(wordCount(result.headline.text)).toBeLessThanOrEqual(25);
    expect(result.reported.length).toBeGreaterThan(0);
  });
  it('never derives a conflict from a stance that did not pass judging', () => {
    const nullClaim: Claim = { ...claim, id: 'c2', stance: 'no_effect_observed', support: 'does_not_support' };
    expect(deriveConflicts([claim, nullClaim])).toEqual([]);
    expect(deriveConflicts([claim, { ...nullClaim, support: undefined }])).toEqual([]);
  });
  it('reads the pinned diphenhydramine when_using section before research', async () => {
    const edge = edges.find(e => e.pair === 'alcohol__diphenhydramine');
    if (!edge) throw new Error('Missing curated pair');
    const reads: string[] = [];
    await research(edge, () => {}, { read: async ref => { reads.push(ref.id); return 'Alcohol may increase drowsiness.'; }, fetch: async () => [], search: async () => [], response: async () => ({ id: 'r1', output: [], output_text: '' }) });
    expect(reads).toContain(`${labelSetIds.diphenhydramine}#when_using`);
  });
});
