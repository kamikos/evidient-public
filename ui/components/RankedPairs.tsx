import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { EvidenceRecord, FestDrugFile, FestRecord, PairKey, Substance } from "@/shared/contract";
import { festFor, loadFest } from "@/ui/fest";
import type { GraphEdge } from "@/ui/model";
import { signalOf } from "@/ui/signal";
import { barsOf, festTop, rankLabel, rankOf, tone, type Rank } from "@/ui/verdict";
import { NO_RISK_CAVEAT, color, font, size, space } from "@/ui/theme";
import { LineFormSample } from "./LineFormSample";
import { SignalMeter } from "./SignalMeter";
import { T } from "./T";
import { order } from "./InteractionIndex";

interface Props {
  edges: GraphEdge[];
  records: Partial<Record<PairKey, EvidenceRecord>>;
  byId: Map<string, Substance>;
  undocumented: [Substance, Substance][];
  selected: PairKey | null;
  onSelect: (pair: PairKey) => void;
}

/** Same names as the header chips: the brand the person recognises, else the generic name. */
const label = (s?: Substance) => (s ? (s.brands?.[0] ?? s.name) : "");
/** Second name in "X with y": brand names keep their capital, only alcohol is a common noun. */
const label2 = (s?: Substance) => (s?.id === "alcohol" ? label(s).toLowerCase() : label(s));

/** Norway's files for every chosen substance, so the list ranks pairs the same way the pair page does. */
function useFestFiles(ids: string[]) {
  const key = [...new Set(ids)].sort().join(",");
  const [files, setFiles] = useState<Map<string, FestDrugFile | null>>(new Map());
  useEffect(() => {
    let alive = true;
    const list = key ? key.split(",") : [];
    Promise.all(list.map((id) => loadFest(id).then((f) => [id, f] as const))).then((all) => alive && setFiles(new Map(all)));
    return () => {
      alive = false;
    };
  }, [key]);
  return (a: string, b: string): FestRecord[] => {
    const fa = festFor(files.get(a) ?? null, b);
    return fa.length ? fa : festFor(files.get(b) ?? null, a);
  };
}

const firstSentence = (s: string) => s.match(/^.+?[.!?](?=\s+[A-Z(]|$)/)?.[0] ?? s;

/** Three or more substances: every documented pair, most serious level first. Names and level only; details on tap. */
export function RankedPairs({ edges, records, byId, undocumented: gaps, selected, onSelect }: Props) {
  const festOf = useFestFiles([...edges.flatMap((e) => [e.a, e.b]), ...gaps.flatMap(([x, y]) => [x.id, y.id])]);
  const rows = edges
    .map((e) => {
      const card = records[e.pair]?.card;
      const signal = card ? signalOf(card) : null;
      return { e, signal, headline: card?.headline.text, rank: card ? rankOf({ card, fest: festOf(e.a, e.b) }) : (0 as Rank) };
    })
    .sort((x, y) => y.rank - x.rank || Number(!!y.signal?.conflict) - Number(!!x.signal?.conflict) || x.e.catalog.localeCompare(y.e.catalog));
  // Pairs only Norway rates: listed at their grade, with Norway's sentence, without a card to open here.
  const norway = gaps.flatMap(([x, y]) => {
    const f = festOf(x.id, y.id);
    return f.length ? [{ x, y, top: festTop(f), rank: rankOf({ fest: f }) }] : [];
  });
  const undocumented = gaps.filter(([x, y]) => !norway.some((n) => n.x === x && n.y === y));
  const ranks = ([4, 3, 2, 1, 0.5] as const).filter((k) => rows.some((r) => r.signal && r.rank === k) || norway.some((n) => n.rank === k));
  const loading = rows.filter((r) => !r.signal);
  const total = rows.length + gaps.length;

  return (
    <View style={styles.wrap}>
      <T style={styles.title} accessibilityRole="header">
        {total} {total === 1 ? "pair" : "pairs"}
        <T style={[styles.title, { color: color.inkFaint, fontFamily: font.regular }]}>{`  ${rows.length + norway.length} documented`}</T>
      </T>
      {ranks.map((k) => {
        const group = rows.filter((r) => r.signal && r.rank === k);
        const fromNorway = norway.filter((n) => n.rank === k);
        return (
          <View key={k}>
            <View style={[styles.groupHead, { borderTopColor: tone(k).mark }]} accessibilityRole="header">
              {k >= 1 && <SignalMeter bars={barsOf(k)} size="sm" on={tone(k).mark} />}
              <T v="heading" style={styles.flex}>
                {rankLabel(k)}
              </T>
              <T v="tag" style={{ color: color.inkSoft }}>
                {group.length + fromNorway.length}
              </T>
            </View>
            {group.map((r) => (
              <PairRow key={r.e.pair} r={r} byId={byId} on={selected === r.e.pair} onSelect={onSelect} />
            ))}
            {fromNorway.map(({ x, y, top }) => {
              const [first, second] = order(x, y);
              return (
                <View key={`${x.id}+${y.id}`} style={styles.row}>
                  <View style={styles.flex}>
                    <T style={styles.names}>
                      {label(first)} with {label2(second)}
                    </T>
                    <T v="small" numberOfLines={2}>
                      <T v="small" style={{ color: color.ink, fontFamily: font.semibold }}>
                        Norway’s database:{" "}
                      </T>
                      {firstSentence(top.consequenceEnglish ?? top.consequence)}
                    </T>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
      {loading.length > 0 && (
        <View>
          {loading.map((r) => (
            <PairRow key={r.e.pair} r={r} byId={byId} on={selected === r.e.pair} onSelect={onSelect} />
          ))}
        </View>
      )}
      {undocumented.length > 0 && (
        <View>
          <View style={[styles.groupHead, { borderTopColor: color.ruleFaint }]} accessibilityRole="header">
            <T v="heading" style={styles.flex}>
              Nothing documented in our sources
            </T>
            <T v="tag" style={{ color: color.inkSoft }}>
              {undocumented.length}
            </T>
          </View>
          {undocumented.map(([x, y]) => (
            <View key={`${x.id}+${y.id}`} style={styles.row}>
              <T style={[styles.names, { color: color.inkSoft }]}>
                {label(x)} with {label2(y)}
              </T>
            </View>
          ))}
          <T v="small" style={{ paddingTop: space[2] }}>
            {NO_RISK_CAVEAT}
          </T>
        </View>
      )}
    </View>
  );
}

function PairRow({
  r,
  byId,
  on,
  onSelect,
}: {
  r: { e: GraphEdge; signal: ReturnType<typeof signalOf> | null; headline?: string; rank: Rank };
  byId: Map<string, Substance>;
  on: boolean;
  onSelect: (pair: PairKey) => void;
}) {
  const [first, second] = order(byId.get(r.e.a), byId.get(r.e.b));
  const copy = r.rank ? { label: rankLabel(r.rank) } : null;
  return (
    <Pressable
      onPress={() => onSelect(r.e.pair)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${first?.name} and ${second?.name}. ${copy?.label ?? "Card loading"}${r.signal?.conflict ? ". Sources disagree" : ""}. Open details.`}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.row, (hovered || pressed) && { backgroundColor: color.hover }, on && styles.rowOn]}
    >
      <View style={styles.flex}>
        <T style={[styles.names, on && { color: color.paper }]}>
          {label(first)} with {label2(second)}
        </T>
        {r.headline ? (
          <T v="small" numberOfLines={2} style={on ? { color: color.paperDeep } : undefined}>
            {r.headline.replace(/\s*(\[c\d+\])+/g, "")}
          </T>
        ) : null}
        {r.signal?.conflict && (
          <View style={styles.meta}>
            <LineFormSample form="conflict" hue={on ? color.paper : color.ink} width={18} />
            <T v="small" style={on ? { color: color.paperDeep } : { color: color.ink }}>
              Sources disagree
            </T>
          </View>
        )}
      </View>
      <ChevronRight size={20} color={on ? color.paper : color.ink} strokeWidth={2.25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[5] },
  title: { fontFamily: font.bold, fontSize: size.xl, lineHeight: 32, letterSpacing: -0.6, color: color.ink },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space[3], borderTopWidth: 4, paddingTop: space[3], paddingBottom: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[4], minHeight: 56, paddingVertical: space[3], paddingHorizontal: space[2], marginHorizontal: -space[2], borderTopWidth: 1, borderTopColor: color.ruleFaint },
  rowOn: { backgroundColor: color.ink },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  names: { fontFamily: font.semibold, fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3, color: color.ink },
  meta: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
});
