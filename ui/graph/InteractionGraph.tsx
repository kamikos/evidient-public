import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
import type { PairKey, Substance } from "@/shared/contract";
import { GRID, color, font, motion, severity, type LineForm } from "@/ui/theme";
import type { GraphEdge } from "@/ui/model";
import { layoutPlate, type Placed } from "./layout";

interface Props {
  substances: Substance[];
  edges: GraphEdge[];
  selected: PairKey | null;
  onSelect?: (pair: PairKey | null) => void;
  /** Bigger marks and type for a specimen plate. */
  scale?: number;
}

export function InteractionGraph({ substances, edges, selected, onSelect, scale = 1 }: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1) setBox({ w: width, h: height });
  };

  const ids = useMemo(() => substances.map((s) => s.id), [substances]);
  const placed = useMemo(() => layoutPlate(ids, edges, box.w, box.h), [ids, edges, box.w, box.h]);
  const pos = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  const byId = useMemo(() => new Map(substances.map((s) => [s.id, s])), [substances]);
  const compact = box.w < 520;

  const focusEdge = selected ? edges.find((e) => e.pair === selected) ?? null : null;

  const veil = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(veil, {
      toValue: focusEdge ? 1 : 0,
      duration: motion.durationBase,
      easing: Easing.out(Easing.exp),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [focusEdge, veil]);

  const ready = box.w > 0 && placed.length === substances.length;
  const mark = { scale, compact };

  return (
    <View style={styles.plate} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ready && (
        <>
          {onSelect && <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} accessible={false} />}

          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={box.w} height={box.h}>
              <RegistrationMarks w={box.w} h={box.h} />
              {edges.map((e) => (
                <EdgeMark key={e.pair} edge={e} a={pos.get(e.a)} b={pos.get(e.b)} {...mark} />
              ))}
              {placed.map((p) => (
                <NodeMark key={p.id} p={p} s={byId.get(p.id)!} w={box.w} {...mark} />
              ))}
            </Svg>
          </View>

          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.paper, opacity: Animated.multiply(veil, 0.82) }]} />

          {focusEdge && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: veil }]}>
              <Svg width={box.w} height={box.h}>
                <EdgeMark edge={focusEdge} a={pos.get(focusEdge.a)} b={pos.get(focusEdge.b)} emphasis {...mark} />
                {[focusEdge.a, focusEdge.b].map((id) => {
                  const p = pos.get(id);
                  return p ? <NodeMark key={id} p={p} s={byId.get(id)!} w={box.w} {...mark} /> : null;
                })}
              </Svg>
            </Animated.View>
          )}

          {onSelect &&
            edges.map((e) => {
              const a = pos.get(e.a);
              const b = pos.get(e.b);
              if (!a || !b) return null;
              const len = Math.hypot(b.x - a.x, b.y - a.y);
              const angle = Math.atan2(b.y - a.y, b.x - a.x);
              const thick = 30;
              return (
                <Pressable
                  key={e.pair}
                  onPress={() => onSelect(e.pair === selected ? null : e.pair)}
                  accessible={false}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.hit,
                    {
                      left: (a.x + b.x) / 2 - len / 2,
                      top: (a.y + b.y) / 2 - thick / 2,
                      width: Math.max(0, len - 40),
                      marginLeft: 20,
                      height: thick,
                      transform: [{ rotate: `${angle}rad` }],
                    },
                    hovered && { backgroundColor: color.hover },
                  ]}
                />
              );
            })}
        </>
      )}
    </View>
  );
}

function RegistrationMarks({ w, h }: { w: number; h: number }) {
  const m = GRID;
  const l = GRID * 0.75;
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ];
  return (
    <G stroke={color.ruleFaint} strokeWidth={1}>
      {corners.map(([x, y, dx, dy], i) => (
        <G key={i}>
          <Line x1={x} y1={y} x2={x + l * dx} y2={y} />
          <Line x1={x} y1={y} x2={x} y2={y + l * dy} />
        </G>
      ))}
    </G>
  );
}

function formOf(edge: GraphEdge): LineForm | null {
  if (edge.conflict) return "conflict";
  return edge.depth;
}

type MarkProps = { scale: number; compact: boolean };

function EdgeMark({ edge, a, b, emphasis = false, scale, compact }: { edge: GraphEdge; a?: Placed; b?: Placed; emphasis?: boolean } & MarkProps) {
  if (!a || !b) return null;
  const hue = edge.level ? severity[edge.level].mark : color.inkFaint;
  const form = formOf(edge);
  const w = (emphasis ? 8 : compact ? 4.5 : 6) * scale;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;

  let body: React.ReactNode;
  if (form === "conflict") {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (w * 0.75);
    const ny = (dx / len) * (w * 0.75);
    body = (
      <G stroke={hue} strokeWidth={w * 0.5}>
        <Line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} />
        <Line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny} />
      </G>
    );
  } else if (form === null) {
    body = <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color.inkFaint} strokeWidth={1.25} />;
  } else {
    const dash = form === "label_only" ? `${18 * scale} ${10 * scale}` : form === "limited" ? `0.1 ${14 * scale}` : undefined;
    body = (
      <Line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={hue}
        strokeWidth={form === "limited" ? w + 1 : w}
        strokeDasharray={dash}
        strokeLinecap={form === "limited" ? "round" : "butt"}
      />
    );
  }

  const tagW = 46;
  return (
    <G>
      {body}
      {!compact && (
        <>
          <Rect x={mx - tagW / 2} y={my - 10} width={tagW} height={20} fill={color.paper} stroke={emphasis ? color.ink : "none"} strokeWidth={1} />
          <SvgText x={mx} y={my + 4.5} fontSize={12} fontFamily={font.narrowBold} fill={color.ink} textAnchor="middle" letterSpacing={0.4}>
            {edge.catalog}
          </SvgText>
        </>
      )}
    </G>
  );
}

function Halo({ children, ...props }: React.ComponentProps<typeof SvgText>) {
  return (
    <>
      <SvgText {...props} fill={color.paper} stroke={color.paper} strokeWidth={5} strokeLinejoin="round">
        {children}
      </SvgText>
      <SvgText {...props}>{children}</SvgText>
    </>
  );
}

function NodeMark({ p, s, w, scale, compact }: { p: Placed; s: Substance; w: number } & MarkProps) {
  const r = (compact ? 9 : 12.5) * scale;
  const labelLeft = p.x > w - GRID * (compact ? 5 : 8);
  const gap = r + 9;
  const lx = labelLeft ? p.x - gap : p.x + gap;
  const anchor = labelLeft ? "end" : "start";
  const nameSize = (compact ? 15 : 20) * scale;
  const showClass = !compact && s.drugClass.toLowerCase() !== s.name.toLowerCase();
  return (
    <G>
      {s.kind === "alcohol" ? (
        <Rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} fill={color.ink} />
      ) : s.kind === "otc" ? (
        <Circle cx={p.x} cy={p.y} r={r - 2} fill={color.paper} stroke={color.ink} strokeWidth={compact ? 3 : 4} />
      ) : (
        <Circle cx={p.x} cy={p.y} r={r} fill={color.ink} />
      )}
      <Halo x={lx} y={p.y + (showClass ? 1 : nameSize * 0.36)} fontSize={nameSize} fontFamily={font.semibold} fill={color.ink} textAnchor={anchor} letterSpacing={-0.3}>
        {s.name}
      </Halo>
      {showClass && (
        <Halo x={lx} y={p.y + 19 * scale} fontSize={12 * Math.min(scale, 1.2)} fontFamily={font.regular} fill={color.inkSoft} textAnchor={anchor}>
          {s.drugClass}
        </Halo>
      )}
    </G>
  );
}

const styles = StyleSheet.create({
  plate: { flex: 1, minHeight: 280, backgroundColor: color.paper, overflow: "hidden" },
  hit: { position: "absolute" },
});
