import type { ProposedClaim } from './verify';
import type { SourceRef } from '../../shared/contract';
export function plantedClaims(material: { ref: SourceRef; text: string }, offset: number, pair: string): ProposedClaim[] {
  const quote = material.text.match(/[^.!?]+[.!?]/)?.[0]?.trim() || material.text.trim();
  if (!quote) throw new Error('Cannot inject without real source material.');
  const base = { source: material.ref, outcome: 'injected_certainty', stance: 'uncertain' as const, injected: true };
  let fabricated = 'Evidient planted quote: a purple comet establishes this interaction in every person.';
  while (material.text.includes(fabricated)) fabricated += ' Fabricated.';
  return [
    { ...base, id: `c${offset + 1}`, text: `The source reports an interaction for ${pair.replace('__', ' and ')}.`, quote: fabricated },
    { ...base, id: `c${offset + 2}`, text: `This source conclusively proves that ${pair.replace('__', ' and ')} always causes a fatal reaction in every person, without any exception.`, quote },
  ];
}
