import type { EdgeCard, PharmacistQuestionTrigger } from '../../shared/contract';
import { catalog } from '../generated/catalog';
import { substances } from '../../data/substances';
export function questions(card: Pick<EdgeCard, 'a' | 'b' | 'depth' | 'conflicts'> & { found?: boolean }): EdgeCard['pharmacistQuestions'] {
  const ids = [card.a, card.b].sort((a, b) => Number(a === 'alcohol') - Number(b === 'alcohol'));
  const [a, b] = ids.map(id => substances.find(s => s.id === id)?.name ?? catalog.find(s => s.id === id)?.name ?? id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '));
  const alcohol = ids.includes('alcohol');
  const result: EdgeCard['pharmacistQuestions'] = [];
  const add = (trigger: PharmacistQuestionTrigger, text: string) => result.push({ trigger, text });
  if (card.found === false) add('no_human_data', 'Evidient found nothing on this pair in the labels and studies it read. Is there anything I should know about taking them together?');
  else if (card.conflicts.length) add('conflict', `The label and a published study disagree here. Which finding fits my situation better?`);
  else if (card.depth === 'label_only') add('label_only', 'The label describes this interaction, but there seem to be no human studies of it. How is it usually handled for someone like me?');
  else if (card.depth === 'limited') add('no_human_data', 'The evidence here is limited. Is there anything about my health that makes this interaction more or less relevant?');
  add('always', alcohol ? 'Do any of my other medicines or products, like cough syrup or mouthwash, contain alcohol?' : `Do any of my other medicines contain ${a} or ${b}, or work the same way?`);
  add('always', `Does my dose, or the time between taking ${a} and ${alcohol ? 'drinking alcohol' : b}, change how much this matters?`);
  return result.slice(0, 3);
}
