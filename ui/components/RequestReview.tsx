import { Pressable, StyleSheet, View } from "react-native";
import { Radio } from "lucide-react-native";
import { color, font, size, space } from "@/ui/theme";
import { T } from "./T";

/** The main action when a pair isn't on the reviewed list: ask the agent to research it now. */
export function RequestReview({ names, onRequest }: { names: string[]; onRequest: () => void }) {
  return (
    <View style={styles.box}>
      <T style={styles.title}>Ask the agent to review this pair</T>
      <T v="body">
        The agent reads the FDA labels for {names.join(" and ")} and searches PubMed. A claim only counts if it quotes its source and a second model confirms the quote. This takes about a minute.
      </T>
      <Pressable onPress={onRequest} accessibilityRole="button" style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.btn, (pressed || hovered) && { opacity: 0.9 }]}>
        <Radio size={18} color={color.paper} strokeWidth={2.25} />
        <T v="heading" style={{ color: color.paper }}>
          Request a review
        </T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space[3], borderWidth: 2, borderColor: color.ink, padding: space[5] },
  title: { fontFamily: font.bold, fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3, color: color.ink },
  btn: { flexDirection: "row", alignItems: "center", gap: space[2], alignSelf: "flex-start", backgroundColor: color.ink, paddingHorizontal: space[5], minHeight: 52 },
});
