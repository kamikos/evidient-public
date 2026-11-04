import { StyleSheet, View } from "react-native";
import { color } from "@/ui/theme";

/** Three printed bars. Filled count = how strongly the label words it. Ink only: level is never a colour. */
export function SignalMeter({ bars, size = "md", on = color.ink }: { bars: number; size?: "sm" | "md" | "lg"; on?: string }) {
  const dims = size === "lg" ? { w: 14, h: 40, gap: 5 } : size === "sm" ? { w: 6, h: 16, gap: 3 } : { w: 9, h: 24, gap: 4 };
  return (
    <View style={[styles.row, { gap: dims.gap }]} accessible={false}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: dims.w,
            height: dims.h,
            backgroundColor: i < bars ? on : "transparent",
            borderWidth: i < bars ? 0 : 1.5,
            borderColor: on,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "flex-end" } });
