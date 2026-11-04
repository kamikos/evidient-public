import type { Claim, Source, StudyDesign, Conflict, EvidenceDepth, EdgeCard, EvidenceSignal, SignalLevel } from '../../shared/contract';
export function publicationDesign(types: string[]): StudyDesign {
  const value = types.join('|');
  if (/Randomized Controlled Trial/i.test(value)) return 'rct';
  if (/Clinical Trial|Controlled Clinical Trial/i.test(value)) return 'controlled_trial';
  if (/Observational Study|Cohort/i.test(value)) return 'cohort';
  if (/Case-Control/i.test(value)) return 'case_control';
  if (/Case Reports/i.test(value)) return 'case_report';
  if (/Review|Meta-Analysis|Systematic Review/i.test(value)) return 'review';
  return 'other';
}
export function deriveDepth(claims: Claim[], sources: Source[]): EvidenceDepth {
  const accepted = claims.filter(c => c.accepted);
  if (accepted.some(c => c.source.kind === 'pubmed' && sources.some(s => s.kind === c.source.kind && s.id === c.source.id && ['rct', 'controlled_trial', 'cohort', 'case_control'].includes(s.design)))) return 'human_studies';
  if (accepted.length && accepted.every(c => c.source.kind === 'fda_label' || c.source.kind === 'eu_smpc')) return 'label_only';
  return 'limited';
}
export function deriveConflicts(claims: Claim[]): Omit<Conflict, 'summary'>[] {
  claims = claims.filter(c => c.accepted && c.support === 'supports' && c.quoteCheck === 'matched');
  return [...new Set(claims.filter(c => c.accepted).map(c => c.outcome))].flatMap(outcome => {
    const sideA = claims.filter(c => c.accepted && c.outcome === outcome && c.stance === 'increases_risk').map(c => c.id);
    const sideB = claims.filter(c => c.accepted && c.outcome === outcome && c.stance === 'no_effect_observed').map(c => c.id);
    return sideA.length && sideB.length ? [{ outcome, sideA, sideB }] : [];
  });
}

/** Label wording that says the combination needs nothing: no significant effect, no interaction expected, no dose change. */
export const REASSURING = /\bno (?:clinically |pharmacokinetic |pharmacodynamic |dose |dosage )*(?:significant|important|relevant|meaningful|interactions?|adjustments?|potentiation|effect on)\b|\bnot (?:expected|anticipated|likely) to (?:significantly |substantially |meaningfully )?(?:interact|affect|alter|change|increase|result)\b|\bwithout (?:any )?clinically (?:significant|relevant|important)\b|\bdid not (?:significantly )?(?:affect|alter|change|increase|potentiate|influence)\b|\b(?:was|were) (?:unchanged|unaffected)\b|\bnot (?:considered )?clinically (?:significant|relevant|important)\b/i;
/** Words that keep a quote a warning even when it also reassures. */
const CAUTIONARY = /avoid|not recommended|should not|discontinue|do not (?:use|take|combine|co-?administer|administer|give|drink|consume|exceed)|monitor|caution|careful|may (?:increase|enhance|potentiate|cause)|increased risk|additive/i;

/** The label's wording determines the signal, never claim prose or a model verdict. */
export function computeSignal(card: Pick<EdgeCard, 'claims' | 'conflicts'> & Partial<Pick<EdgeCard, 'sources'>>): EvidenceSignal {
  const accepted = card.claims.filter(claim => claim.accepted);
  if (!accepted.length) throw new Error('Cannot derive an evidence signal without accepted claims');
  const levels: SignalLevel[] = ['serious_warning', 'label_advises_against', 'label_mentions', 'label_no_interaction', 'studies_only'];
  const ranked = accepted.map(claim => {
    let level: SignalLevel = 'studies_only';
    if (claim.source.kind === 'fda_label' || claim.source.kind === 'eu_smpc') {
      const language = card.sources?.find(s => s.kind === claim.source.kind && s.id === claim.source.id)?.language;
      const quote = language !== 'en' ? claim.quoteEnglish ?? claim.quote : claim.quote;
      const section = claim.source.id.split('#')[1];
      level = /^(boxed_warning|contraindications)$/i.test(section ?? '') || /death|fatal|life-threatening|contraindicated/i.test(quote)
        ? 'serious_warning'
        : REASSURING.test(quote) && !CAUTIONARY.test(quote)
          ? 'label_no_interaction'
          : /avoid|not recommended|do not|should not|discontinue/i.test(quote) ? 'label_advises_against' : 'label_mentions';
    }
    return { claim, level };
  });
  const level = levels.find(level => ranked.some(item => item.level === level)) ?? 'studies_only';
  return { level, basis: ranked.filter(item => item.level === level).map(item => item.claim.id), conflict: card.conflicts.length > 0 };
}
