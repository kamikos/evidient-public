import { StyleSheet, View } from "react-native";
import { color, font, size, space } from "@/ui/theme";
import { T } from "./T";

/** A page section: big flush-left head, optional count in a lighter weight, optional one-line note. */
export function Section({ title, count, note, wide = true, children }: { title: string; count?: number; note?: string; wide?: boolean; children: React.ReactNode }) {
  const head = [styles.title, !wide && styles.titleNarrow];
  return (
    <View style={styles.section}>
      <View style={{ gap: space[1] }}>
        <T style={head} accessibilityRole="header">
          {title}
          {count !== undefined ? <T style={[...head, styles.count]}>{`  ${count}`}</T> : null}
        </T>
        {note ? <T v="small">{note}</T> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[4] },
  title: { fontFamily: font.bold, fontSize: size.xl, lineHeight: 32, letterSpacing: -0.6, color: color.ink },
  titleNarrow: { fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3 },
  count: { color: color.inkFaint, fontFamily: font.regular },
});

/** "Ibuprofen / with warfarin": the first name in ink, the second a step quieter. */
export function PairTitle({ a, b, page = true }: { a: string; b: string; page?: boolean }) {
  const v = page ? "title" : "heading";
  return (
    <T v={v} accessibilityRole="header">
      {a}
      {page ? "\n" : " "}
      <T v={v} style={{ color: color.inkSoft, fontFamily: font.medium }}>
        with {b.toLowerCase()}
      </T>
    </T>
  );
}
