import { Pressable, StyleSheet, View } from "react-native";
import type { PairKey, Substance } from "@/shared/contract";
import type { GraphEdge } from "@/ui/model";
import { NO_RISK_CAVEAT, category as categoryTokens, color, lineForm, severity, space } from "@/ui/theme";
import { LineFormSample } from "./LineFormSample";
import { T } from "./T";

interface Props {
  edges: GraphEdge[];
  byId: Map<string, Substance>;
  selected: PairKey | null;
  onSelect: (pair: PairKey) => void;
  undocumented: [Substance, Substance][];
}

/** The catalogue: list alternative to the graph, readable by screen readers and on small screens. */
export function InteractionIndex({ edges, byId, selected, onSelect, undocumented }: Props) {
  return (
    <View style={styles.wrap}>
      <T v="heading" accessibilityRole="header">
        {edges.length === 1 ? "1 documented interaction" : `${edges.length} documented interactions`}
      </T>
      <View style={styles.list}>
        {edges.map((e) => {
          const [first, second] = order(byId.get(e.a), byId.get(e.b));
          const cat = categoryTokens[e.category];
          const form = e.conflict ? "conflict" : e.depth;
          const on = selected === e.pair;
          return (
            <Pressable
              key={e.pair}
              onPress={() => onSelect(e.pair)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${first?.name} and ${second?.name}. ${cat.label}. ${form ? lineForm[form].label : "Evidence not yet assessed"}. Open evidence.`}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.row, (hovered || pressed) && styles.rowHover, on && styles.rowOn]}
            >
              <T v="heading" style={on && { color: color.paper }}>
                {first?.name} × {second?.name}
              </T>
              <View style={styles.rowForm}>
                <LineFormSample form={form} hue={on ? color.paper : e.level ? severity[e.level].mark : color.inkFaint} width={28} />
                <T v="small" style={[{ flexShrink: 1 }, on && { color: color.paperDeep }]}>
                  {form ? lineForm[form].label : "Not yet assessed"} · {cat.short}
                </T>
                <T v="small" style={[{ flexShrink: 0 }, on && { color: color.paperDeep }]}>
                  · {e.catalog}
                </T>
              </View>
            </Pressable>
          );
        })}
      </View>

      {undocumented.length > 0 && (
        <View style={styles.absent}>
          <T v="heading">Nothing documented in our sources</T>
          <T v="small" style={{ color: color.ink }}>
            {undocumented.map(([x, y]) => `${x.name} × ${y.name}`).join(" · ")}
          </T>
          <T v="small">None of the labels or studies Evidient covers mention these. {NO_RISK_CAVEAT}</T>
        </View>
      )}
    </View>
  );
}

/** Medicine first, alcohol second; otherwise keep curated order. */
export function order(a?: Substance, b?: Substance): [Substance | undefined, Substance | undefined] {
  if (a?.kind === "alcohol") return [b, a];
  return [a, b];
}

const styles = StyleSheet.create({
  wrap: { gap: space[3] },
  list: { borderTopWidth: 2, borderTopColor: color.ink },
  row: { paddingVertical: space[3], paddingHorizontal: space[2], marginHorizontal: -space[2], gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.ruleFaint },
  rowHover: { backgroundColor: color.paperDeep },
  rowOn: { backgroundColor: color.ink },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space[2] },
  swatch: { width: 10, height: 10 },
  rowForm: { flexDirection: "row", alignItems: "center", gap: space[2] },
  absent: { gap: 4, paddingTop: space[3], borderTopWidth: 1, borderTopColor: color.ink },
});
