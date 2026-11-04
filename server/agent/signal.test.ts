import { describe, expect, it } from 'vitest';
import type { Claim, EdgeCard, Source } from '../../shared/contract';
import { signalOf } from '../../ui/signal';
import { computeSignal, deriveDepth } from './derive';

function claim(id: string, quote: string, section = 'warnings', accepted = true): Claim {
  return { id, text: 'Avoid this fatal interaction.', quote,
    source: { kind: 'fda_label', id: `label#${section}` },
    stance: 'increases_risk', outcome: 'interaction', quoteCheck: 'matched', support: 'supports', accepted };
}
describe('label evidence signal', () => {
  it.each(['boxed_warning', 'contraindications'])('uses the exact %s section', section => {
    expect(computeSignal({ claims: [claim('c1', 'Interaction reported.', section)], conflicts: [] }))
      .toEqual({ level: 'serious_warning', basis: ['c1'], conflict: false });
  });
  it.each(['DEATH', 'Fatal', 'Life-Threatening', 'CONTRAINDICATED'])('uses serious quote wording %s', quote => {
    expect(computeSignal({ claims: [claim('c1', quote)], conflicts: [] }).level).toBe('serious_warning');
  });
  it.each(['AVOID', 'Not Recommended', 'Do Not', 'Should Not', 'Discontinue'])('uses label instruction %s', quote => {
    expect(computeSignal({ claims: [claim('c1', quote)], conflicts: [] }).level).toBe('label_advises_against');
  });
  it('uses mentions despite severe wording in claim prose or rejected quotes', () => {
    expect(computeSignal({ claims: [claim('c1', 'Drowsiness reported.'), claim('c2', 'Fatal', 'boxed_warning', false)], conflicts: [] }))
      .toEqual({ level: 'label_mentions', basis: ['c1'], conflict: false });
  });
  it.each([
    'Coadministration of abacavir and atazanavir is not expected to significantly alter abacavir exposure.',
    'NRTIs do not appear to induce or inhibit the P450 enzyme pathway, thus no interactions with buprenorphine are expected.',
    'No dosage adjustments are recommended when darunavir/ritonavir is co-administered with abacavir.',
    'Tiagabine has shown no clinically important potentiation of the effects of alcohol.',
    'Ethanol: the metabolism of abacavir is altered by concomitant ethanol resulting in an increase in AUC of abacavir of about 41%. These findings are not considered clinically significant.',
  ])('reads "%s" as no significant interaction', quote => {
    expect(computeSignal({ claims: [claim('c1', quote, 'drug_interactions')], conflicts: [] }).level).toBe('label_no_interaction');
  });
  it('keeps a reassuring quote a warning when it also cautions', () => {
    expect(computeSignal({ claims: [claim('c1', 'No pharmacokinetic interactions were seen, but additive effects on motor function were seen.')], conflicts: [] }).level).toBe('label_mentions');
    expect(computeSignal({ claims: [claim('c1', 'No interaction is expected; avoid alcohol.')], conflicts: [] }).level).toBe('label_advises_against');
  });
  it('lets any warning quote outrank a reassuring one', () => {
    const level = computeSignal({ claims: [claim('c1', 'No clinically important potentiation.'), claim('c2', 'Use cautiously in combination.')], conflicts: [] }).level;
    expect(level).toBe('label_mentions');
  });
  it('uses studies only regardless of serious study quote wording', () => {
    const study = { ...claim('c1', 'Death'), source: { kind: 'pubmed', id: '1' } } satisfies Claim;
    expect(computeSignal({ claims: [study], conflicts: [] })).toEqual({ level: 'studies_only', basis: ['c1'], conflict: false });
  });
  it('keeps only all claims triggering the highest level and preserves conflicts', () => {
    expect(computeSignal({ claims: [claim('c1', 'Avoid'), claim('c2', 'Fatal'), claim('c3', 'Death')],
      conflicts: [{ outcome: 'interaction', sideA: ['c2'], sideB: ['c3'], summary: { text: 'Sources differ.', claimIds: ['c2', 'c3'] } }] }))
      .toEqual({ level: 'serious_warning', basis: ['c2', 'c3'], conflict: true });
  });
  it('refuses to invent a level without accepted evidence', () => {
    expect(() => computeSignal({ claims: [], conflicts: [] })).toThrow('without accepted claims');
  });
});


function uiCard(card: Pick<EdgeCard, 'claims' | 'conflicts' | 'sources'>): EdgeCard {
  return { pair: 'alcohol__warfarin', a: 'alcohol', b: 'warfarin', category: 'other', depth: 'label_only', origin: 'batch', headline: { text: 'Interaction', claimIds: ['eu'] }, reported: [], mechanism: [], gaps: [], pharmacistQuestions: [], generatedAt: '', models: { research: '', judge: '', synth: '' }, ...card };
}

describe('EU regulatory label derivation', () => {
  const source: Source = { kind: 'eu_smpc', id: 'ES:123#4.5', title: 'RCP', url: 'https://cima.aemps.es/', citation: 'CIMA', language: 'es', design: 'regulatory_label' };
  const eu = (quoteEnglish?: string): Claim => ({ ...claim('eu', 'Evitar el consumo de alcohol.'), source: { kind: source.kind, id: source.id }, quoteEnglish });
  it.each([
    ['May cause fatal respiratory depression.', 'serious_warning'],
    ['Avoid alcohol.', 'label_advises_against'],
    ['Increased sedation reported.', 'label_mentions'],
    [undefined, 'label_mentions'],
  ])('uses English rendering %s on server and UI', (translation, level) => {
    const card = { claims: [eu(translation)], conflicts: [], sources: [source] };
    expect(computeSignal(card).level).toBe(level);
    expect(signalOf(uiCard(card))).toEqual(computeSignal(card));
  });
  it('uses original English wording when the source is English', () => {
    const card = { claims: [{ ...eu('Fatal'), quote: 'Sedation reported.' }], conflicts: [], sources: [{ ...source, language: 'en' }] };
    expect(computeSignal(card).level).toBe('label_mentions');
    expect(signalOf(uiCard(card))).toEqual(computeSignal(card));
  });
  it('counts EU-only and mixed regulatory evidence as label_only', () => {
    expect(deriveDepth([eu()], [source])).toBe('label_only');
    expect(deriveDepth([eu(), claim('fda', 'Sedation')], [source])).toBe('label_only');
    const study: Claim = { ...claim('study', 'Observed'), source: { kind: 'pubmed', id: '1' } };
    expect(deriveDepth([eu(), study], [{ ...source, kind: 'pubmed', id: '1', design: 'rct' }])).toBe('human_studies');
  });
});
