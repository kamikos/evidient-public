import { Text, type TextProps, type TextStyle } from "react-native";
import { color, font, size } from "@/ui/theme";

type Variant = "display" | "title" | "heading" | "lead" | "body" | "small" | "meta" | "tag";

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: font.bold, fontSize: size.display, lineHeight: size.display * 0.98, letterSpacing: -2.4, color: color.ink },
  title: { fontFamily: font.bold, fontSize: size.xxl, lineHeight: size.xxl * 1.02, letterSpacing: -1.2, color: color.ink },
  heading: { fontFamily: font.bold, fontSize: size.md, lineHeight: 22, letterSpacing: -0.1, color: color.ink },
  lead: { fontFamily: font.medium, fontSize: size.lg, lineHeight: 27, letterSpacing: -0.3, color: color.ink },
  body: { fontFamily: font.regular, fontSize: size.md, lineHeight: 24, color: color.ink },
  small: { fontFamily: font.regular, fontSize: size.sm, lineHeight: 20, color: color.inkSoft },
  meta: { fontFamily: font.regular, fontSize: size.xs, lineHeight: 16, color: color.inkFaint },
  tag: { fontFamily: font.narrowBold, fontSize: size.xs, lineHeight: 16, letterSpacing: 0.4, color: color.ink },
};

export function T({ v = "body", style, ...rest }: TextProps & { v?: Variant }) {
  return <Text {...rest} style={[variants[v], style]} />;
}
