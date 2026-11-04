import { Platform, Pressable, StyleSheet } from "react-native";
import { Monitor, Moon, Sun } from "lucide-react-native";
import { color, setThemePref, themePref, type ThemePref } from "@/ui/theme";

const next: Record<ThemePref, ThemePref> = { system: "dark", dark: "light", light: "system" };
const name: Record<ThemePref, string> = { system: "system", dark: "dark", light: "light" };

/** Cycles system → dark → light. Web only: native follows the system setting. */
export function ThemeToggle() {
  if (Platform.OS !== "web") return null;
  const Icon = themePref === "dark" ? Moon : themePref === "light" ? Sun : Monitor;
  return (
    <Pressable
      onPress={() => setThemePref(next[themePref])}
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${name[themePref]}. Switch to ${name[next[themePref]]}`}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.btn, hovered && { backgroundColor: color.hover }]}
    >
      <Icon size={20} color={color.ink} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ btn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" } });
