import type { BatchIndexRow, EdgeCard, FestRecord, SignalLevel } from "@/shared/contract";
import { signalOf } from "@/ui/signal";
import { color, severity } from "@/ui/theme";

/**
 * One scale for every source. Each source keeps its own wording (the FDA label's, Norway's grade),
 * and the page shows the strongest of them. Rank 0 means nothing is documented.
 */
export type Rank = 0 | 0.5 | 1 | 2 | 3 | 4;

/** Off the warning scale: a label or Norway's database says the effect is not clinically significant. */
export const NOT_SIGNIFICANT = {
  rank: 0.5 as const,
  label: "No significant interaction",
  meaning: "A label or Norway’s database says the effect is not clinically significant",
};

/** The word for a rank, including the two states off the warning scale. */
export const rankLabel = (rank: Rank) => (rank >= 1 ? LADDER[rank as 1].label : rank === 0.5 ? NOT_SIGNIFICANT.label : "Nothing documented");

export const LADDER: Record<1 | 2 | 3 | 4, { label: string; meaning: string; level: SignalLevel }> = {
  4: { label: "Serious warning", meaning: "A label says it can be fatal, or not to combine them", level: "serious_warning" },
  3: { label: "Advised against", meaning: "A label or Norway’s database says to avoid it", level: "label_advises_against" },
  2: { label: "Caution", meaning: "Sources describe an interaction to watch for", level: "label_mentions" },
  1: { label: "Studies only", meaning: "Only published studies report it; no label covers the pair", level: "studies_only" },
};

export const rankOfLevel = (l: SignalLevel): Rank => ({ serious_warning: 4, label_advises_against: 3, label_mentions: 2, studies_only: 1, label_no_interaction: 0.5 } as const)[l];
export const rankOfFest = (r: FestRecord["relevance"]): Rank => (r === "1" ? 3 : r === "2" ? 2 : 0.5);
export const festTop = (records: FestRecord[]) => [...records].sort((x, y) => x.relevance.localeCompare(y.relevance))[0];

/** Colours for a rank: the warning ramp, grey for rank 1 and 0. */
export function tone(rank: Rank) {
  if (rank === 0) return { field: color.paperDeep, on: color.ink, mark: color.inkFaint };
  if (rank === 0.5) return severity.label_no_interaction;
  return severity[LADDER[rank].level];
}

/** Bars on the 3-bar meter: rank 1 shows none, rank 4 all three. */
export const barsOf = (rank: Rank) => Math.max(0, rank - 1);

/** Strongest rank across a card (or its index row) and Norway's records. */
export function rankOf({ card, batch, fest }: { card?: EdgeCard; batch?: BatchIndexRow; fest?: FestRecord[] }): Rank {
  const level = card ? signalOf(card).level : batch?.level;
  const fromCard = level ? rankOfLevel(level) : 0;
  const top = fest?.length ? festTop(fest) : undefined;
  const fromFest = top ? rankOfFest(top.relevance) : 0;
  return Math.max(fromCard, fromFest) as Rank;
}

/** What each source says, in its own words, one short phrase each. */
export const labelSays: Record<SignalLevel, string> = {
  serious_warning: "Warns it can be life-threatening",
  label_advises_against: "Advises against combining",
  label_mentions: "Mentions an interaction",
  label_no_interaction: "Says no significant interaction",
  studies_only: "Says nothing about it",
};
