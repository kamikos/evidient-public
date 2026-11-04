import type { CuratedEdge, EdgeCard, EvidenceDepth, HarmCategory, PairKey, SignalLevel, Substance, SubstanceId } from "@/shared/contract";
import { signalOf } from "@/ui/signal";

export interface GraphEdge {
  pair: PairKey;
  a: SubstanceId;
  b: SubstanceId;
  category: HarmCategory;
  label: string;
  depth: EvidenceDepth | null; // null = card not built yet
  conflict: boolean;
  level: SignalLevel | null; // label warning level, null until the card loads
  catalog: string; // "EV-04": stable catalogue number from curated order
}

export function pairKey(a: SubstanceId, b: SubstanceId): PairKey {
  return (a < b ? `${a}__${b}` : `${b}__${a}`) as PairKey;
}

export function catalogNumber(index: number) {
  return `EV-${String(index + 1).padStart(2, "0")}`;
}

/** Edges among the chosen substances, in curated order, enriched with what the precomputed cards say. */
export function graphEdges(
  chosen: SubstanceId[],
  curated: CuratedEdge[],
  cards: Partial<Record<PairKey, EdgeCard>>,
): GraphEdge[] {
  const set = new Set(chosen);
  return curated
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => set.has(e.a) && set.has(e.b))
    .map(({ e, i }) => {
      const card = cards[e.pair];
      return {
        pair: e.pair,
        a: e.a,
        b: e.b,
        category: e.category,
        label: e.label,
        depth: card?.depth ?? null,
        conflict: (card?.conflicts.length ?? 0) > 0,
        level: card ? signalOf(card).level : null,
        catalog: catalogNumber(i),
      };
    });
}

/** Pairs among the chosen substances that have NO curated edge, to state absence explicitly. */
export function undocumentedPairs(chosen: Substance[], edges: GraphEdge[]) {
  const have = new Set(edges.map((e) => e.pair));
  const out: [Substance, Substance][] = [];
  for (let i = 0; i < chosen.length; i++)
    for (let j = i + 1; j < chosen.length; j++)
      if (!have.has(pairKey(chosen[i].id, chosen[j].id))) out.push([chosen[i], chosen[j]]);
  return out;
}
