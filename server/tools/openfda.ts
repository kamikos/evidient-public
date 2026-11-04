import type { RunContext } from '../runContext';
import { z } from 'zod';
import { labelSetIds } from '../../data/substances';
import { fetchJson } from './http';

export const LABEL_SECTIONS = ['boxed_warning', 'contraindications', 'warnings', 'warnings_and_cautions', 'precautions', 'drug_interactions', 'clinical_pharmacology', 'do_not_use', 'ask_doctor_or_pharmacist', 'stop_use', 'when_using'] as const;
const labelSchema = z.object({ set_id: z.string(), openfda: z.object({ generic_name: z.array(z.string()).optional() }).optional() }).catchall(z.unknown());
const responseSchema = z.object({ results: z.array(labelSchema) });
export type LabelSection = { kind: 'fda_label'; id: string; setId: string; section: string; text: string; url: string };

export async function getLabelSections(substance: string): Promise<LabelSection[]> {
  const pin = labelSetIds[substance.toLowerCase()];
  if (!pin) throw new Error(`No pinned label for ${substance}`);
  return getLabelSectionsBySetId(pin);
}

export async function getLabelSectionsBySetId(setId: string, signal?: AbortSignal, context?: RunContext): Promise<LabelSection[]> {
  if (!/^[a-f0-9-]{36}$/i.test(setId)) throw new Error('Invalid label set ID');
  const url = new URL('https://api.fda.gov/drug/label.json');
  url.searchParams.set('search', `set_id:"${setId}"`);
  url.searchParams.set('limit', '1');
  const label = responseSchema.parse(await fetchJson(url, signal, context)).results[0];
  if (!label || label.set_id !== setId) throw new Error('Pinned label not found');
  return LABEL_SECTIONS.flatMap(section => {
    const values = z.array(z.string()).optional().parse(label[section]);
    return values?.length ? [{ kind: 'fda_label', id: `${setId}#${section}`, setId, section, text: values.join('\n\n'), url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}` }] : [];
  });
}
