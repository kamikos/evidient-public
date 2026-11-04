import type { RunContext } from '../runContext';
import { z } from 'zod';
import { fetchJson } from './http';

const exactSchema = z.object({ idGroup: z.object({ rxnormId: z.array(z.string()).optional() }) });
const approximateSchema = z.object({ approximateGroup: z.object({ candidate: z.array(z.object({ rxcui: z.string() })).optional() }) });
const propertiesSchema = z.object({ properties: z.object({ name: z.string() }) });

export async function normalize(name: string, signal?: AbortSignal, context?: RunContext): Promise<{ rxcui: string; name: string } | null> {
  const query = name.trim();
  if (!query) return null;
  const exact = new URL('https://rxnav.nlm.nih.gov/REST/rxcui.json');
  exact.searchParams.set('name', query);
  let rxcui = exactSchema.parse(await fetchJson(exact, signal, context)).idGroup.rxnormId?.[0];
  if (!rxcui) {
    const approximate = new URL('https://rxnav.nlm.nih.gov/REST/approximateTerm.json');
    approximate.searchParams.set('term', query);
    approximate.searchParams.set('maxEntries', '1');
    rxcui = approximateSchema.parse(await fetchJson(approximate, signal, context)).approximateGroup.candidate?.[0]?.rxcui;
  }
  if (!rxcui) return null;
  const properties = propertiesSchema.parse(await fetchJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${encodeURIComponent(rxcui)}/properties.json`, signal, context));
  return { rxcui, name: properties.properties.name };
}
