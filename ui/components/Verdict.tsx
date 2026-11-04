import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { LADDER, barsOf, rankLabel, tone, type Rank } from "@/ui/verdict";
import { color, font, size, space } from "@/ui/theme";
import { SignalMeter } from "./SignalMeter";
import { T } from "./T";

/**
 * The answer, first thing on a pair page: one coloured field with the strongest rating any source gives,
 * a sentence naming who gives it, and the four-step scale so the word has a place to sit.
 */
export function Verdict({ rank, label, because, compact = false }: { rank: Rank; label?: string; because?: string; compact?: boolean }) {
  const t = tone(rank);
  const text = label ?? rankLabel(rank);
  return (
    <View style={{ gap: space[3] }}>
      <View style={[styles.field, compact && styles.fieldCompact, { backgroundColor: t.field }]} accessibilityRole="summary">
        {rank >= 1 && <SignalMeter bars={barsOf(rank)} size={compact ? "md" : "lg"} on={t.on} />}
        <View style={styles.flex}>
          <T style={[styles.fieldText, compact && styles.fieldTextCompact, { color: t.on }]}>{text}</T>
          {because ? (
            <T v="small" style={{ color: t.on, fontFamily: font.medium }}>
              {because}
            </T>
          ) : null}
        </View>
      </View>
      {rank >= 1 && <Scale rank={rank} />}
    </View>
  );
}

/** Four steps, weakest to strongest. The current one is in full colour and bold; the rest stay faint. */
function Scale({ rank }: { rank: Rank }) {
  return (
    <View style={styles.scale} accessible accessibilityLabel={`Step ${rank} of 4 on Evidient’s scale: ${rank ? LADDER[rank as 1].label : ""}`}>
      {([1, 2, 3, 4] as const).map((r) => {
        const on = r === rank;
        return (
          <View key={r} style={styles.step}>
            <View style={[styles.stepBar, { backgroundColor: tone(r).mark, opacity: on ? 1 : 0.28 }, on && styles.stepBarOn]} />
            <T v="meta" style={on ? styles.stepOn : undefined} numberOfLines={2}>
              {LADDER[r].label}
            </T>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One source and what it says, in its own words. Left: who and its rating. Right: the evidence.
 * Stacks on narrow screens.
 */
export function Says({ who, rating, rank, url, linkLabel, stack = false, children }: { who: string; rating: string; rank: Rank; url?: string; linkLabel?: string; stack?: boolean; children?: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const narrow = stack || width < 640;
  const t = tone(rank);
  return (
    <View style={[styles.says, narrow && styles.saysNarrow]}>
      <View style={[styles.who, narrow && { width: "auto" }]}>
        <T v="heading">{who}</T>
        <View style={styles.rating}>
          {rank >= 1 ? <SignalMeter bars={barsOf(rank)} size="sm" on={t.mark} /> : null}
          <T v="small" style={{ color: color.ink, fontFamily: font.semibold, flexShrink: 1 }}>
            {rating}
          </T>
        </View>
      </View>
      <View style={styles.what}>
        {children}
        {url ? (
          <Pressable onPress={() => Linking.openURL(url)} accessibilityRole="link" style={styles.link}>
            <T v="small" style={{ color: color.ink, textDecorationLine: "underline" }}>
              {linkLabel ?? "Open the source"}
            </T>
            <ArrowUpRight size={14} color={color.ink} strokeWidth={2.25} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Small uppercase heading over a block, e.g. "WHO SAYS WHAT". */
export function Kicker({ children }: { children: string }) {
  return (
    <T v="tag" style={{ color: color.inkSoft }} accessibilityRole="header">
      {children.toUpperCase()}
    </T>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[5], paddingVertical: space[4] },
  fieldCompact: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3] },
  fieldText: { fontFamily: font.bold, fontSize: size.xl, lineHeight: 32, letterSpacing: -0.6 },
  fieldTextCompact: { fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3 },
  flex: { flex: 1, gap: 2 },
  scale: { flexDirection: "row", gap: 4 },
  step: { flex: 1, gap: 6 },
  stepBar: { height: 6 },
  stepBarOn: { height: 10, marginTop: -4 },
  stepOn: { color: color.ink, fontFamily: font.bold },
  says: { flexDirection: "row", gap: space[5], paddingVertical: space[4], borderTopWidth: 1, borderTopColor: color.ruleFaint },
  saysNarrow: { flexDirection: "column", gap: space[2] },
  who: { width: 200, gap: 6 },
  rating: { flexDirection: "row", alignItems: "center", gap: space[2] },
  what: { flex: 1, gap: space[2], minWidth: 0 },
  link: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 28 },
});
