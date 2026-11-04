import type { RunContext } from '../runContext';
import { sources } from '../generated/sources';
import type { SourceRef } from '../../shared/contract';
import { getLabelSectionsBySetId } from './openfda';
import { fetchAbstracts } from './pubmed';

export function rememberSource(ref: SourceRef, text: string, context?: RunContext): void {
  context?.sources?.set(`${ref.kind}:${ref.id}`, text);
}
export async function getSourceText(ref: SourceRef, signal?: AbortSignal, context?: RunContext): Promise<string> {
  signal?.throwIfAborted();
  const remembered = context?.sources?.get(`${ref.kind}:${ref.id}`);
  if (remembered !== undefined) return remembered;
  const snapshot = sources[ref.id];
  if (snapshot?.kind === ref.kind) return snapshot.text;
  if (ref.kind === 'fda_label') {
    const [setId] = ref.id.split('#');
    const sections = await getLabelSectionsBySetId(setId, signal, context);
    for (const section of sections) rememberSource(section, section.text, context);
    const section = sections.find(section => section.id === ref.id);
    if (!section) throw new Error('Label section not found');
    return section.text;
  }
  const article = (await fetchAbstracts([ref.id], signal, context))[0];
  if (!article?.abstractText) throw new Error('Abstract not found');
  rememberSource(ref, article.abstractText, context);
  return article.abstractText;
}
