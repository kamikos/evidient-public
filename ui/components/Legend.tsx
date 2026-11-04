import { StyleSheet, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
import type { SignalLevel } from "@/shared/contract";
import { signalCopy } from "@/ui/signal";
import { color, lineForm, severity, space, type LineForm } from "@/ui/theme";
import { LineFormSample } from "./LineFormSample";
import { T } from "./T";

const forms: LineForm[] = ["human_studies", "label_only", "limited", "conflict"];
const levels: SignalLevel[] = ["serious_warning", "label_advises_against", "label_mentions", "studies_only", "label_no_interaction"];

export function Legend() {
  return (
    <View style={styles.wrap} accessibilityLabel="Legend. Line colour shows the label warning level. Line style shows the kind of evidence. Mark shape shows prescription, over the counter, or alcohol.">
      <View style={styles.col}>
        {levels.map((l) => (
          <View key={l} style={styles.row}>
            <View style={{ width: 30, height: 4, backgroundColor: severity[l].mark }} />
            <T v="meta" style={styles.label}>
              {signalCopy[l].short}
            </T>
          </View>
        ))}
      </View>
      <View style={styles.col}>
        {forms.map((f) => (
          <View key={f} style={styles.row}>
            <LineFormSample form={f} width={30} />
            <T v="meta" style={styles.label}>
              {lineForm[f].label}
            </T>
          </View>
        ))}
      </View>
      <View style={styles.col}>
        <View style={styles.row}>
          <Svg width={14} height={14}>
            <Circle cx={7} cy={7} r={6} fill={color.ink} />
          </Svg>
          <T v="meta" style={styles.label}>
            Prescription
          </T>
        </View>
        <View style={styles.row}>
          <Svg width={14} height={14}>
            <Circle cx={7} cy={7} r={5} fill="none" stroke={color.ink} strokeWidth={2.5} />
          </Svg>
          <T v="meta" style={styles.label}>
            Over the counter
          </T>
        </View>
        <View style={styles.row}>
          <Svg width={14} height={14}>
            <Rect x={1} y={1} width={12} height={12} fill={color.ink} />
          </Svg>
          <T v="meta" style={styles.label}>
            Alcohol
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", gap: space[5], backgroundColor: color.paper, paddingVertical: space[2], paddingRight: space[3] },
  col: { gap: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 16 },
  label: { color: color.inkSoft },
});
