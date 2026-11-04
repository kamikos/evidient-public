import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera } from "lucide-react-native";
import type { Substance, SubstanceId } from "@/shared/contract";
import { color, space } from "@/ui/theme";
import { T } from "./T";

type IdentifyResponse = {
  candidates: { substanceId: SubstanceId | null; readText: string; confidence: "high" | "medium" | "low" }[];
};

type State = { kind: "idle" } | { kind: "reading" } | { kind: "found"; names: string[] } | { kind: "miss"; read: string } | { kind: "error" };

/** Photograph a medicine box; Muse Spark reads it and we match to a covered substance. */
export function ScanButton({ all, onFound, compact, size: variant = "md" }: { all: Substance[]; onFound: (id: SubstanceId) => void; compact?: boolean; size?: "md" | "lg" }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const scan = async () => {
    try {
      let result: ImagePicker.ImagePickerResult;
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], base64: true, quality: 0.6 };
      if (Platform.OS === "web") {
        result = await ImagePicker.launchImageLibraryAsync(opts);
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        result = perm.granted ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (result.canceled || !result.assets[0]?.base64) return;
      const asset = result.assets[0];
      setState({ kind: "reading" });
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as IdentifyResponse;
      const ids = data.candidates.map((c) => c.substanceId).filter((x): x is SubstanceId => !!x && all.some((s) => s.id === x));
      if (ids.length) {
        ids.forEach(onFound);
        setState({ kind: "found", names: ids.map((id) => all.find((s) => s.id === id)!.name) });
      } else {
        setState({ kind: "miss", read: data.candidates[0]?.readText ?? "" });
      }
    } catch {
      setState({ kind: "error" });
    }
  };

  const message =
    state.kind === "found"
      ? `Added ${state.names.join(", ")} from the box`
      : state.kind === "miss"
        ? `Found “${state.read.slice(0, 40)}” on the box. Evidient doesn't cover it yet.`
        : state.kind === "error"
          ? "Couldn't read that photo. Try again with the name in view."
          : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={scan}
        disabled={state.kind === "reading"}
        accessibilityRole="button"
        accessibilityLabel="Scan a medicine box"
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.btn, variant === "lg" && styles.btnLg, compact && styles.btnCompact, (hovered || pressed) && styles.btnHover]}
      >
        {state.kind === "reading" ? <ActivityIndicator size="small" color={color.paper} /> : <Camera size={18} color={color.paper} strokeWidth={2.25} />}
        {!compact && <T v="heading" style={{ color: color.paper }}>{state.kind === "reading" ? "Reading box" : "Scan a box"}</T>}
      </Pressable>
      {message && (
        <Pressable onPress={() => setState({ kind: "idle" })} style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <T v="small" style={{ color: color.paper }}>
            {message}
          </T>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", zIndex: 15 },
  btn: { flexDirection: "row", alignItems: "center", gap: space[2], backgroundColor: color.ink, paddingHorizontal: space[4], minHeight: 44 },
  btnLg: { minHeight: 60, paddingHorizontal: space[5], justifyContent: "center" },
  btnCompact: { width: 44, justifyContent: "center", paddingHorizontal: 0 },
  btnHover: { backgroundColor: color.inkSoft },
  toast: { position: "absolute", top: 52, right: 0, width: 280, backgroundColor: color.ink, padding: space[3] },
});
