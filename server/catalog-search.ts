import type { CatalogEntry } from '../shared/contract';
import { catalog } from './generated/catalog';

export function normalizeCatalogName(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').trim();
}
const indexed = catalog.map(entry => ({ entry, names: [entry.id, entry.name, ...entry.synonyms, ...entry.brands.map(b => b.name)].map(normalizeCatalogName) }));
export function searchCatalog(query: string): { results: CatalogEntry[] } {
  const q = normalizeCatalogName(query);
  if (!q) return { results: [] };
  return { results: indexed.map(({ entry, names }) => ({ entry, rank: Math.max(...names.map(n => n === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) ? 1 : 0)) }))
    .filter(hit => hit.rank > 0)
    .sort((a,b) => b.rank - a.rank || Number(Boolean(b.entry.substanceId)) - Number(Boolean(a.entry.substanceId)) || a.entry.id.localeCompare(b.entry.id, 'en'))
    .slice(0,12).map(hit => hit.entry) };
}
