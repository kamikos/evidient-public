import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import type { BatchIndexRow, CuratedEdge, FestDrugFile, Substance, SubstanceId } from "@/shared/contract";
import { useFest } from "@/ui/fest";
import { ComboList, combosWith, combosWithout, withFest, type ComboItem } from "@/ui/components/ComboList";
import { ScanButton } from "@/ui/components/ScanButton";
import { SourcesCredits } from "@/ui/components/SourcesCredits";
import { SubstanceSearch } from "@/ui/components/SubstanceSearch";
import { Section } from "@/ui/components/Section";
import { T } from "@/ui/components/T";
import { displayName } from "@/ui/signal";
import { DISCLAIMER, NO_RISK_CAVEAT, color, font, size, space } from "@/ui/theme";
import { useEvidenceMap } from "@/ui/useEvidence";

interface Props {
  all: Substance[];
  byId: Map<string, Substance>;
  edges: CuratedEdge[];
  chosen: SubstanceId[]; // 0 or 1
  recent: SubstanceId[][];
  wide: boolean;
  onAdd: (id: SubstanceId) => void;
  onOpen: (ids: SubstanceId[]) => void;
  /** Agent-built cards for the focused substance. */
  researched?: ComboItem[];
  /** Every agent-built card, for the index on the home page. */
  batch?: BatchIndexRow[];
  /** List title for any substance id. */
  titleOf?: (id: SubstanceId) => string;
  /** Norway's interaction database file for the focused substance. */
  fest?: FestDrugFile | null;
}

type Tab = "alcohol" | "medicine";

export function HomeView({ all, byId, edges, chosen, recent, wide, onAdd, onOpen, researched = [], batch = [], titleOf = (id) => id, fest }: Props) {
  const focus = chosen[0] ? byId.get(chosen[0]) : undefined;
  const [tab, setTab] = useState<Tab>("alcohol");

  // The index merges Norway's alcohol ratings into the alcohol list.
  const alcoholFest = useFest(focus ? null : "alcohol");
  const alcoholAll = useMemo<ComboItem[]>(
    () =>
      withFest(
        [
          ...combosWith("alcohol", edges, byId),
          ...batch.filter((r) => r.a === "alcohol" || r.b === "alcohol").map((r) => ({ ids: ["alcohol", r.a === "alcohol" ? r.b : r.a], title: titleOf(r.a === "alcohol" ? r.b : r.a), batch: r })),
        ],
        alcoholFest,
        "alcohol",
        titleOf,
      ),
    [edges, byId, batch, titleOf, alcoholFest],
  );
  const otherAll = useMemo<ComboItem[]>(
    () => [
      ...combosWithout("alcohol", edges, byId),
      ...batch.filter((r) => r.a !== "alcohol" && r.b !== "alcohol").map((r) => ({ ids: [r.a, r.b], title: `${titleOf(r.a)} + ${titleOf(r.b)}`, batch: r })),
    ],
    [edges, byId, batch, titleOf],
  );
  const focusItems = useMemo(() => (focus ? withFest([...combosWith(focus.id, edges, byId), ...researched], fest, focus.id, titleOf) : []), [focus, edges, byId, researched, fest, titleOf]);
  const recentItems = useMemo<ComboItem[]>(
    () =>
      recent
        .filter((ids) => ids.every((id) => byId.has(id)))
        .slice(0, 4)
        .map((ids) => {
          const edge = ids.length === 2 ? edges.find((e) => ids.includes(e.a) && ids.includes(e.b)) : undefined;
          return { ids, title: ids.map((id) => displayName(byId.get(id)!)).join(" + "), edge };
        }),
    [recent, edges, byId],
  );
  const undocumentedWithFocus = useMemo(
    () => (focus ? all.filter((s) => s.id !== focus.id && !focusItems.some((i) => i.ids.includes(s.id))) : []),
    [all, focus, focusItems],
  );

  const pairs = useMemo(
    () => [...new Set([...(focus ? focusItems : [...alcoholAll, ...otherAll]), ...recentItems].flatMap((i) => (i.edge ? [i.edge.pair] : [])))],
    [focus, focusItems, alcoholAll, otherAll, recentItems],
  );
  const records = useEvidenceMap(pairs);
  const focusName = focus ? (focus.brands?.[0] ?? focus.name) : "";

  const addBar = (
    <View style={[styles.addBar, !wide && { flexDirection: "column", alignItems: "stretch" }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <SubstanceSearch
          all={all}
          chosen={chosen}
          onAdd={onAdd}
          size="lg"
          placeholder={focus ? (focus.id === "alcohol" ? "Add a medicine: Tylenol, Xanax…" : "Add alcohol or a medicine") : "Adderall, Tylenol, wine…"}
        />
      </View>
      <ScanButton all={all} onFound={onAdd} size="lg" />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.page, !wide && styles.pageNarrow]} keyboardShouldPersistTaps="handled">
      <View style={styles.top}>
        {focus ? (
          <>
            <T v={wide ? "display" : "title"} accessibilityRole="header">
              {focusName}
            </T>
            <T v="lead" style={{ color: color.inkSoft }}>
              {[focus.brands?.length ? focus.name : null, focus.drugClass].filter((x) => x && x !== focusName).join(" · ")}
            </T>
          </>
        ) : (
          <>
            <T v={wide ? "display" : "title"} accessibilityRole="header">
              What are you{"\n"}mixing?
            </T>
            <T v="lead" style={styles.lede}>
              What FDA labels, European product information and published studies say about combining medicines with alcohol or with each other. Every statement links to the sentence it came from.
            </T>
          </>
        )}
        {addBar}
      </View>

      {focus ? (
        <View style={styles.sections}>
          <Section title={`Documented with ${focusName}`} count={focusItems.length} note="Strongest warning first." wide={wide}>
            <ComboList items={focusItems} records={records} onOpen={onOpen} limit={6} emptyText={`Nothing documented in our sources. ${NO_RISK_CAVEAT}`} />
          </Section>
          {undocumentedWithFocus.length > 0 && (
            <View style={styles.absent}>
              <T v="heading">Nothing documented with</T>
              <View style={styles.absentList}>
                {undocumentedWithFocus.map((s) => (
                  <Pressable key={s.id} onPress={() => onOpen([focus.id, s.id])} accessibilityRole="button" style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.absentChip, hovered && { backgroundColor: color.hover }]}>
                    <T v="small" style={{ color: color.ink }}>
                      {displayName(s)}
                    </T>
                  </Pressable>
                ))}
              </View>
              <T v="small">{NO_RISK_CAVEAT}</T>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.sections}>
          {recentItems.length > 0 && (
            <Section title="Recent" wide={wide}>
              <ComboList items={recentItems} records={records} onOpen={onOpen} grouped={false} />
            </Section>
          )}
          <View style={styles.section}>
            <View style={[styles.indexHead, !wide && { flexDirection: "column", alignItems: "flex-start" }]}>
              <View style={{ gap: space[1], flexShrink: 1 }}>
                <T style={styles.sectionTitle} accessibilityRole="header">
                  Browse combinations
                </T>
                <T v="small">Strongest warning first.</T>
              </View>
              <View style={styles.tabs} accessibilityRole="tablist">
                {(
                  [
                    ["alcohol", "With alcohol", alcoholAll.length],
                    ["medicine", "Medicine with medicine", otherAll.length],
                  ] as const
                ).map(([key, label, n]) => {
                  const on = tab === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setTab(key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tab, on && styles.tabOn, hovered && !on && { backgroundColor: color.hover }]}
                    >
                      <T v="small" style={{ color: on ? color.paper : color.ink, fontFamily: font.semibold }}>
                        {label}
                      </T>
                      <T v="tag" style={{ color: on ? color.paper : color.inkFaint }}>
                        {n}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {tab === "medicine" && (
              <T v="small" style={{ color: color.ink }}>
                These are the pairs Evidient has reviewed from labels and studies. Search for a medicine to see all of its pairs, including the 11,627 rated in Norway’s interaction database.
              </T>
            )}
            <ComboList items={tab === "alcohol" ? alcoholAll : otherAll} records={records} onOpen={onOpen} limit={5} />
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Pressable onPress={() => onOpen(["metronidazole", "alcohol", "sertraline"])} accessibilityRole="link" style={styles.mapLink}>
          <T v="small" style={{ color: color.ink, textDecorationLine: "underline" }}>
            Add three or more to see every pair at once
          </T>
          <ArrowRight size={14} color={color.ink} strokeWidth={2.25} />
        </Pressable>
        <T v="meta">{DISCLAIMER}</T>
        <SourcesCredits />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space[7], paddingTop: space[7], paddingBottom: space[8], gap: space[8], maxWidth: 880, width: "100%", alignSelf: "center" },
  pageNarrow: { paddingHorizontal: space[4], paddingTop: space[5], gap: space[7] },
  top: { gap: space[4], maxWidth: 860, zIndex: 20 },
  lede: { color: color.inkSoft, maxWidth: 640 },
  addBar: { flexDirection: "row", alignItems: "stretch", gap: space[3], marginTop: space[3], zIndex: 20 },
  sections: { gap: space[8] },
  section: { gap: space[4] },
  sectionTitle: { fontFamily: font.bold, fontSize: size.xl, lineHeight: 32, letterSpacing: -0.6, color: color.ink },
  count: { color: color.inkFaint, fontFamily: font.regular },
  indexHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space[4], flexWrap: "wrap" },
  tabs: { flexDirection: "row", borderWidth: 1.5, borderColor: color.ink },
  tab: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], minHeight: 40 },
  tabOn: { backgroundColor: color.ink },
  absent: { gap: space[2] },
  absentList: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  absentChip: { borderWidth: 1, borderColor: color.ruleFaint, paddingHorizontal: space[3], paddingVertical: space[2], minHeight: 36, justifyContent: "center" },
  footer: { gap: space[3], borderTopWidth: 1, borderTopColor: color.ink, paddingTop: space[4] },
  mapLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 32 },
});
