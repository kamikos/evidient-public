import Svg, { G, Line } from "react-native-svg";
import type { LineForm } from "@/ui/theme";
import { color } from "@/ui/theme";

/** The same line grammar the graph uses, at legend scale. */
export function LineFormSample({ form, hue = color.ink, width = 40 }: { form: LineForm | null; hue?: string; width?: number }) {
  const y = 8;
  if (form === "conflict")
    return (
      <Svg width={width} height={16}>
        <G stroke={hue} strokeWidth={2.5}>
          <Line x1={0} y1={y - 3} x2={width} y2={y - 3} />
          <Line x1={0} y1={y + 3} x2={width} y2={y + 3} />
        </G>
      </Svg>
    );
  const dash = form === "label_only" ? "10 6" : form === "limited" ? "0.1 9" : undefined;
  return (
    <Svg width={width} height={16}>
      <Line
        x1={form === "limited" ? 3 : 0}
        y1={y}
        x2={width}
        y2={y}
        stroke={form === null ? color.inkFaint : hue}
        strokeWidth={form === "limited" ? 5 : form === null ? 1.25 : 4}
        strokeDasharray={dash}
        strokeLinecap={form === "limited" ? "round" : "butt"}
      />
    </Svg>
  );
}
