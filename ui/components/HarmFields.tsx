import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { CuratedEdge, HarmCategory } from "@/shared/contract";
import { category as categoryTokens, color, font, size, space } from "@/ui/theme";
import { T } from "./T";

const ORDER: HarmCategory[] = ["cns_depression", "serotonin", "bleeding", "liver", "reaction", "efficacy", "other"];

/**
 * The Basel move: colour fields at full scale, each one a harm type with its count.
 * Tapping a field filters the lists below; tapping it again clears the filter.
 */
export function HarmFields({ edges, active, onToggle, wide }: { edges: CuratedEdge[]; active: HarmCategory | null; onToggle: (c: HarmCategory) => void; wide: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);
  const counts = new Map<HarmCategory, number>();
  edges.forEach((e) => counts.set(e.category, (counts.get(e.category) ?? 0) + 1));
  const shown = ORDER.filter((c) => counts.get(c));
  const fields = shown.map((c) => {
    const t = categoryTokens[c];
    const on = active === c;
    const dimmed = active !== null && !on;
    return (
      <Pressable
        key={c}
        onPress={() => onToggle(c)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${t.label}: ${counts.get(c)} documented combinations. ${on ? "Clear filter" : "Show only these"}`}
        style={({ hovered, pressed }: { pressed: boolean; hovered?: boolean }) => [
          styles.field,
          wide ? styles.fieldWide : styles.fieldNarrow,
          { backgroundColor: t.field, opacity: dimmed ? 0.28 : 1 },
          hovered && !on && { opacity: dimmed ? 0.5 : 0.9 },
          // The one dimensional moment: the field tips back while pressed, then returns flat.
          pressed && !reduceMotion && { transform: [{ perspective: 600 }, { rotateX: "14deg" }], borderBottomWidth: 2, borderBottomColor: color.ink },
          Platform.OS === "web" && ({ transitionProperty: "transform, opacity", transitionDuration: reduceMotion ? "0ms" : "160ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)", transformOrigin: "bottom" } as object),
        ]}
      >
        <T style={[styles.count, { color: t.on }]}>{counts.get(c)}</T>
        <T v="small" style={{ color: t.on, fontFamily: font.semibold }}>
          {t.short}
        </T>
        {on && <View style={[styles.mark, { backgroundColor: t.on }]} />}
      </Pressable>
    );
  });
  return wide ? (
    <View style={styles.row}>{fields}</View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={{ marginHorizontal: -space[4] }}>
      <View style={{ width: space[4] - space[1] }} />
      {fields}
      <View style={{ width: space[4] - space[1] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[1] },
  field: { padding: space[3], justifyContent: "space-between", minHeight: 128 },
  fieldWide: { flex: 1 },
  fieldNarrow: { width: 132 },
  count: { fontFamily: font.bold, fontSize: size.display, lineHeight: 64, letterSpacing: -2.4 },
  mark: { position: "absolute", top: space[3], right: space[3], width: 10, height: 10 },
});
