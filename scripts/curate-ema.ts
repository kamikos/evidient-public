// Codex-authored selections. Writes drafts only; independent verdicts remain required.
import { existsSync } from 'node:fs';
import { identity, packetSchema, terms } from './batch-packets';
import { claimsSchema } from './validate-batch';
import { compact, read, save } from './batch-io';
import { euSchema } from './eu-smpc';

const selections = [
  { owner: 'abacavir', partner: 'alcohol', quote: 'Ethanol: the metabolism of abacavir is altered by concomitant ethanol resulting in an increase in AUC of abacavir of about 41%. These findings are not considered clinically significant.', text: 'The EMA abacavir label reports about 41% higher abacavir exposure with ethanol and says this is not considered clinically significant.', category: 'other', stance: 'no_effect_observed', outcome: 'abacavir_exposure' },
  { owner: 'daridorexant', partner: 'alcohol', quote: 'Co-administration of 50 mg daridorexant with alcohol led to additive effects on psychomotor performance.', text: 'The EMA daridorexant label reports additive effects on psychomotor performance when 50 mg daridorexant was co-administered with alcohol.', category: 'cns_depression', stance: 'increases_risk', outcome: 'psychomotor_impairment' },
  { owner: 'perampanel', partner: 'alcohol', quote: 'The effects of perampanel on tasks involving alertness and vigilance such as driving ability were additive or supra-additive to the effects of alcohol itself, as found in a pharmacodynamic interaction study in healthy subjects.', text: 'The EMA perampanel label reports additive or supra-additive effects with alcohol on alertness and vigilance tasks in healthy subjects.', category: 'cns_depression', stance: 'increases_risk', outcome: 'psychomotor_impairment' },
  { owner: 'varenicline', partner: 'alcohol', quote: 'There have been post marketing reports of increased intoxicating effects of alcohol in patients treated with varenicline.', text: 'The EMA varenicline label reports postmarketing cases of increased intoxicating effects of alcohol during varenicline treatment.', category: 'cns_depression', stance: 'increases_risk', outcome: 'alcohol_intoxication' },
  { owner: 'midazolam', partner: 'alcohol', quote: 'The co-administration of midazolam with other sedative/hypnotic medicinal products and CNS depressants, including alcohol, is likely to result in enhanced sedation and respiratory depression.', text: 'The EMA midazolam label states that co-administration with CNS depressants, including alcohol, is likely to enhance sedation and respiratory depression.', category: 'cns_depression', stance: 'increases_risk', outcome: 'respiratory_depression' },
  { owner: 'pregabalin', partner: 'alcohol', quote: 'Pregabalin may potentiate the effects of ethanol and lorazepam.', text: 'The EMA pregabalin label states that pregabalin may potentiate the effects of ethanol.', category: 'cns_depression', stance: 'increases_risk', outcome: 'cns_depression' },
  { owner: 'pregabalin', partner: 'lorazepam', quote: 'Pregabalin may potentiate the effects of ethanol and lorazepam.', text: 'The EMA pregabalin label states that pregabalin may potentiate the effects of lorazepam.', category: 'cns_depression', stance: 'increases_risk', outcome: 'cns_depression' },
  { owner: 'abiraterone', partner: 'dextromethorphan', quote: 'In a study to determine the effects of abiraterone acetate (plus prednisone) on a single dose of the CYP2D6 substrate dextromethorphan, the systemic exposure (AUC) of dextromethorphan was increased approximately 2.9 fold.', text: 'The EMA abiraterone label reports approximately 2.9-fold higher dextromethorphan exposure in a study of abiraterone acetate plus prednisone.', category: 'other', stance: 'mechanism', outcome: 'dextromethorphan_exposure' },
];
const pending = [];
for (const selection of selections) {
  const [a, b] = [selection.owner, selection.partner].sort();
  const pair = `${a}__${b}`;
  const file = `${pair}.json`;
  const eu = euSchema.parse(read(`data/sources/eu/EU/${selection.owner}.json`));
  const section = eu.sections.find(s => s.section === '4.5');
  if (!section || !section.text.includes(selection.quote)) throw Error(`Quote absent: ${pair}`);
  const sourceId = `EU:${eu.registryId}#4.5`;
  const packetPath = `data/batch/packets/${file}`;
  const packet = packetSchema.parse(existsSync(packetPath) ? read(packetPath) : { pair, a, b, identities: [identity(a), identity(b)], sources: [], prescan: [], queries: [] });
  if (!packet.sources.some(s => s.ref.id === sourceId)) packet.sources.push({ ref: { kind: 'eu_smpc', id: sourceId }, title: `${eu.product}: 4.5`, url: section.url, citation: eu.attribution, country: 'EU', language: 'en', design: 'regulatory_label', text: compact(section.text, terms(selection.partner)) });
  const selectedSource = packet.sources.find(s => s.ref.id === sourceId);
  if (selectedSource && !selectedSource.text.includes(selection.quote)) selectedSource.text = section.text;
  save(packetPath, packet);
  const claimPath = `data/batch/claims/${file}`;
  const draft = claimsSchema.parse(existsSync(claimPath) ? read(claimPath) : { pair, curator: 'gpt-6.1-sol', claims: [], headline: { text: selection.text, claimIds: ['cEU1'] }, reported: [], mechanism: [], category: selection.category, gaps: [] });
  if (!draft.claims.some(c => c.id === 'cEU1')) {
    draft.claims.push(claimsSchema.shape.claims.element.parse({ id: 'cEU1', text: selection.text, quote: selection.quote, sourceId, stance: selection.stance, outcome: selection.outcome }));
    draft.reported.push({ text: selection.text, claimIds: ['cEU1'] });
    draft.curator = 'gpt-6.1-sol';
    save(claimPath, draft);
  }
  pending.push({ pair, claimIds: ['cEU1'], sourceId, status: 'awaiting independent non-Meta judge; shipped evidence unchanged' });
}
save('data/batch/ema-pending.json', pending);
console.log(`${pending.length} EMA drafts await independent judgment`);
