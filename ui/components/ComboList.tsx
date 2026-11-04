import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import type { BatchIndexRow, CuratedEdge, EvidenceRecord, FestDrugFile, FestRecord, PairKey, Substance, SubstanceId } from "@/shared/contract";
import { NOTHING_DOCUMENTED, displayName, signalOf } from "@/ui/signal";
import { category as categoryTokens, color, font, size, space } from "@/ui/theme";
import { barsOf, festTop, rankLabel, rankOf, tone, type Rank } from "@/ui/verdict";
import { SignalMeter } from "./SignalMeter";
import { T } from "./T";

export interface ComboItem {
  ids: SubstanceId[];
  /** Big line, e.g. "Adderall (amphetamine)" in a "With alcohol" list, or "Tylenol (acetaminophen) + Alcohol". */
  title: string;
  edge?: CuratedEdge;
  /** Agent-built card shipped with the app: the row shows its level and headline without loading the card. */
  batch?: BatchIndexRow;
  /** Norway's interaction database (FEST) records for this pair, strongest grade first. */
  fest?: FestRecord[];
}

type Group = { key: string; label: string; bars: number; mark: string; rank: number };

const RANK_GROUP = (rank: Exclude<Rank, 0>): Group => ({
  key: rank === 0.5 ? "clear" : `r${rank}`,
  label: rankLabel(rank),
  bars: barsOf(rank),
  mark: tone(rank).mark,
  rank: rank * 10,
});
const LOADING: Group = { key: "loading", label: "Loading", bars: 0, mark: color.inkFaint, rank: 2 };
const NONE: Group = { key: "none", label: NOTHING_DOCUMENTED.label, bars: 0, mark: color.inkFaint, rank: 0 };

function groupOf(i: ComboItem, records: Partial<Record<PairKey, EvidenceRecord>>): Group {
  const r = i.edge ? records[i.edge.pair] : undefined;
  if (i.edge && !r) return LOADING;
  const rank: Rank = rankOf({ card: r?.card, batch: i.batch, fest: i.fest });
  return rank === 0 ? NONE : RANK_GROUP(rank);
}

/**
 * Combinations grouped by how strongly the source words the interaction, strongest first.
 * The group header carries the level, so rows carry only names, the summary and the kind of harm.
 */
export function ComboList({
  items,
  records,
  onOpen,
  emptyText,
  limit,
  grouped = true,
}: {
  items: ComboItem[];
  records: Partial<Record<PairKey, EvidenceRecord>>;
  onOpen: (ids: SubstanceId[]) => void;
  emptyText?: string;
  /** Rows shown per group before a "Show all" button. */
  limit?: number;
  /** false: one flat list where each row shows its own level (used for Recent). */
  grouped?: boolean;
}) {
  if (!items.length) return emptyText ? <T v="small">{emptyText}</T> : null;
  const withGroup = items.map((item) => ({ item, g: groupOf(item, records) }));
  if (!grouped) {
    return (
      <View style={styles.flat}>
        {withGroup.map(({ item, g }) => (
          <ComboRow key={item.ids.join("+")} item={item} record={item.edge ? records[item.edge.pair] : undefined} onOpen={onOpen} group={g} />
        ))}
      </View>
    );
  }
  const groups = new Map<string, { g: Group; rows: ComboItem[] }>();
  for (const { item, g } of withGroup) {
    const entry = groups.get(g.key) ?? { g, rows: [] };
    entry.rows.push(item);
    groups.set(g.key, entry);
  }
  const ordered = [...groups.values()].sort((x, y) => y.g.rank - x.g.rank);
  return (
    <View style={{ gap: space[5] }}>
      {ordered.map(({ g, rows }) => (
        <GroupBlock key={g.key} g={g} rows={rows.sort((x, y) => x.title.localeCompare(y.title))} records={records} onOpen={onOpen} limit={limit} />
      ))}
    </View>
  );
}

function GroupBlock({ g, rows, records, onOpen, limit }: { g: Group; rows: ComboItem[]; records: Partial<Record<PairKey, EvidenceRecord>>; onOpen: (ids: SubstanceId[]) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? rows.slice(0, limit) : rows;
  return (
    <View>
      <View style={[styles.groupHead, { borderTopColor: g.key === "none" || g.key === "loading" ? color.ruleFaint : g.mark }]} accessibilityRole="header">
        {g.key !== "none" && g.key !== "loading" && g.key !== "clear" && <SignalMeter bars={g.bars} size="sm" on={g.mark} />}
        <T v="heading" style={styles.groupLabel}>
          {g.label}
        </T>
        <T v="tag" style={{ color: color.inkSoft }}>
          {rows.length}
        </T>
      </View>
      {shown.map((item) => (
        <ComboRow key={item.ids.join("+")} item={item} record={item.edge ? records[item.edge.pair] : undefined} onOpen={onOpen} />
      ))}
      {shown.length < rows.length && (
        <Pressable
          onPress={() => setAll(true)}
          accessibilityRole="button"
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.more, (hovered || pressed) && styles.rowHover]}
        >
          <T v="small" style={{ color: color.ink, fontFamily: font.semibold }}>
            Show all {rows.length}
          </T>
        </Pressable>
      )}
    </View>
  );
}

/** One combination. In a flat list (`group` given) the row also shows its level. */
function ComboRow({ item, record, onOpen, group }: { item: ComboItem; record?: EvidenceRecord; onOpen: (ids: SubstanceId[]) => void; group?: Group }) {
  const fest = item.fest?.length && !item.edge && !item.batch ? festTop(item.fest) : null;
  const harm = item.edge?.category ?? item.batch?.category;
  const cat = harm ? categoryTokens[harm] : null;
  // Norway's entries run to several sentences; the row keeps the first, the page has the rest.
  const headline = fest
    ? firstSentence(fest.consequenceEnglish ?? fest.consequence)
    : record
      ? record.card.headline.text
      : item.batch?.headline;
  const conflict = record ? signalOf(record.card).conflict : item.batch?.conflict;
  // The tag only ever names the kind of harm. Norway rows say their source in the summary instead.
  const harmTag = !fest && cat && harm !== "other" ? cat.short.toUpperCase() : null;
  // Where the rating comes from, so a row never has to be opened to know that.
  const tag = harmTag;
  return (
    <Pressable
      onPress={() => onOpen(item.ids)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}.${group ? ` ${group.label}.` : ""}${conflict ? " Sources disagree." : ""} Open details.`}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.row, (hovered || pressed) && styles.rowHover]}
    >
      {group && (
        <View style={styles.flatMeter}>
          <SignalMeter bars={group.bars} size="sm" on={group.mark} />
        </View>
      )}
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <T style={styles.title}>{item.title}</T>
          {tag && (
            <T v="tag" style={styles.tag}>
              {tag}
            </T>
          )}
        </View>
        {group && (
          <T v="small" style={{ color: color.ink, fontFamily: font.semibold }}>
            {group.label}
          </T>
        )}
        {headline ? (
          <T v="small" numberOfLines={2}>
            {fest ? <T v="small" style={{ color: color.ink, fontFamily: font.semibold }}>Norway’s database: </T> : null}
            {headline.replace(/\s*(\[c\d+\])+/g, "")}
          </T>
        ) : null}
        {conflict ? (
          <T v="small" style={{ color: color.ink }}>
            Sources disagree
          </T>
        ) : null}
      </View>
      <ArrowRight size={18} color={color.ink} strokeWidth={2.25} />
    </Pressable>
  );
}

function firstSentence(s: string) {
  const m = s.match(/^.+?[.!?](?=\s+[A-Z(]|$)/);
  return m ? m[0] : s;
}

/**
 * Adds Norway's records to the rows that already exist for `id`, and a row for every other pair Norway rates.
 * One list per substance, ranked by the strongest source.
 */
export function withFest(items: ComboItem[], file: FestDrugFile | null | undefined, id: SubstanceId, title: (otherId: SubstanceId) => string): ComboItem[] {
  if (!file || file.id !== id) return items;
  const byOther = new Map(file.rows.map((r) => [r.other, r.records]));
  const seen = new Set<string>();
  const out = items.map((i) => {
    const other = i.ids.find((x) => x !== id);
    if (!other || i.ids.length !== 2) return i;
    seen.add(other);
    const f = byOther.get(other);
    return f ? { ...i, fest: f } : i;
  });
  for (const r of file.rows) if (!seen.has(r.other)) out.push({ ids: [id, r.other], title: title(r.other), fest: r.records });
  return out;
}

/** Rows from Norway's interaction database for one substance, skipping pairs already listed elsewhere. */
export function festCombos(file: { rows: { other: string; records: FestRecord[] }[] } | null, id: SubstanceId, title: (otherId: SubstanceId) => string, skip: Set<string>): ComboItem[] {
  return (file?.rows ?? []).filter((r) => !skip.has(r.other)).map((r) => ({ ids: [id, r.other], title: title(r.other), fest: r.records }));
}

/** Helpers to build lists from the curated edge set. */
export function combosWith(id: SubstanceId, edges: CuratedEdge[], byId: Map<string, Substance>): ComboItem[] {
  return edges
    .filter((e) => e.a === id || e.b === id)
    .map((e) => {
      const other = byId.get(e.a === id ? e.b : e.a)!;
      return { ids: [id, other.id], title: displayName(other), edge: e };
    });
}

/** Rows for agent-built cards that include `id`. `title` names the other substance. */
export function batchCombos(rows: BatchIndexRow[], id: SubstanceId, title: (otherId: SubstanceId) => string): ComboItem[] {
  return rows
    .filter((r) => r.a === id || r.b === id)
    .map((r) => {
      const other = r.a === id ? r.b : r.a;
      return { ids: [id, other], title: title(other), batch: r };
    });
}

export function combosWithout(id: SubstanceId, edges: CuratedEdge[], byId: Map<string, Substance>): ComboItem[] {
  return edges
    .filter((e) => e.a !== id && e.b !== id)
    .map((e) => ({ ids: [e.a, e.b], title: `${displayName(byId.get(e.a)!)} + ${displayName(byId.get(e.b)!)}`, edge: e }));
}

const styles = StyleSheet.create({
  flat: { borderTopWidth: 2, borderTopColor: color.ink },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space[3], borderTopWidth: 4, paddingTop: space[3], paddingBottom: space[2] },
  groupLabel: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space[4], paddingVertical: space[3], paddingHorizontal: space[2], marginHorizontal: -space[2], borderTopWidth: 1, borderTopColor: color.ruleFaint, minHeight: 56 },
  rowHover: { backgroundColor: color.hover },
  flatMeter: { width: 28, alignSelf: "flex-start", paddingTop: 6 },
  main: { flex: 1, gap: 4, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: space[3], flexWrap: "wrap" },
  title: { fontFamily: font.semibold, fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3, color: color.ink, flexShrink: 1 },
  tag: { color: color.inkFaint },
  more: { minHeight: 44, justifyContent: "center", paddingHorizontal: space[2], marginHorizontal: -space[2], borderTopWidth: 1, borderTopColor: color.ruleFaint },
});
