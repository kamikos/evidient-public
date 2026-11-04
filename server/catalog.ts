import { substances } from '../data/substances';
import { edges } from '../data/edges';

export function searchSubstances(query: string) {
  const q = query.trim().toLowerCase();
  return { results: substances.filter(s => [s.id, s.name, ...s.aliases].some(name => name.toLowerCase().includes(q))) };
}
export function getGraph(ids: string[]) {
  const selected = new Set(ids);
  return {
    substances: substances.filter(s => selected.has(s.id)),
    edges: edges.filter(edge => selected.has(edge.a) && selected.has(edge.b)).map(edge => ({ ...edge, depth: null })),
  };
}
