import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Plus } from "lucide-react-native";
import type { Substance, SubstanceId } from "@/shared/contract";
import { brandList, fromSubstances, searchCatalog, useCatalog, type Hit } from "@/ui/catalog";
import { color, font, size, space } from "@/ui/theme";
import { T } from "./T";

interface Props {
  /** reviewed substances; used for quick picks and as the fallback catalogue */
  all: Substance[];
  chosen: SubstanceId[];
  onAdd: (id: SubstanceId) => void;
  autoFocus?: boolean;
  size?: "md" | "lg";
  placeholder?: string;
}

export function SubstanceSearch({ all, chosen, onAdd, autoFocus, size: variant = "md", placeholder = "Add a medicine or alcohol" }: Props) {
  const lg = variant === "lg";
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const catalog = useCatalog();
  const reviewedById = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);

  const results: Hit[] = useMemo(() => {
    // Reviewed substances missing from the registry catalogue (alcohol is not a registered medicine) are merged in.
    // Reviewed substances missing from the registry catalogue (alcohol is not a registered medicine) are merged in,
    // and reviewed substances' own brand names (e.g. Tylenol) are added to their catalogue entries.
    const curated = new Map(fromSubstances(all).map((e) => [e.id, e]));
    const ids = new Set((catalog ?? []).map((e) => e.id));
    const merged = catalog
      ? [
          ...catalog.map((e) => {
            const c = curated.get(e.id);
            if (!c) return e;
            const have = new Set(e.brands.map((b) => b.name.toLowerCase()));
            return { ...e, brands: [...c.brands.filter((b) => !have.has(b.name.toLowerCase())), ...e.brands], synonyms: [...new Set([...e.synonyms, ...c.synonyms])] };
          }),
          ...[...curated.values()].filter((c) => !ids.has(c.id)),
        ]
      : [...curated.values()];
    const list = merged.filter((e) => !chosen.includes(e.id));
    if (!q.trim()) {
      // Empty field: suggest reviewed substances, alcohol first.
      return list
        .filter((e) => e.substanceId)
        .sort((a, b) => (a.id === "alcohol" ? -1 : b.id === "alcohol" ? 1 : a.name.localeCompare(b.name)))
        .slice(0, 8)
        .map((entry) => ({ entry, score: 0 }));
    }
    return searchCatalog(list, q, 8);
  }, [q, catalog, all, chosen]);

  const pick = (h: Hit) => {
    onAdd(h.entry.id);
    setQ("");
    setActive(0);
    input.current?.focus();
  };

  const open = focused && (q.length > 0 || results.length > 0);

  return (
    <View style={styles.wrap}>
      <View style={[styles.field, lg && styles.fieldLg, focused && styles.fieldFocused]}>
        <Plus size={lg ? 24 : 18} color={color.ink} strokeWidth={2.5} />
        <TextInput
          ref={input}
          value={q}
          onChangeText={(t) => {
            setQ(t);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onSubmitEditing={() => results[active] && pick(results[active])}
          onKeyPress={(e) => {
            const k = e.nativeEvent.key;
            if (k === "ArrowDown") setActive((i) => Math.min(i + 1, results.length - 1));
            if (k === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
            if (k === "Escape") input.current?.blur();
          }}
          placeholder={placeholder}
          placeholderTextColor={color.inkFaint}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={placeholder}
          style={[styles.input, lg && styles.inputLg]}
        />
      </View>
      {open && (
        <View style={[styles.menu, lg && styles.menuLg]} accessibilityRole="menu">
          {results.length === 0 ? (
            <View style={styles.row}>
              <T v="small" style={{ color: color.ink }}>
                No medicine called “{q.trim()}” in Evidient’s list.
              </T>
              <T v="small">Try the name of the active ingredient, as printed under the brand on the box.</T>
            </View>
          ) : (
            results.map((h, i) => {
              const reviewed = h.entry.substanceId ? reviewedById.get(h.entry.substanceId) : undefined;
              const brands = brandList(h.entry, 3).filter((b) => b !== h.via);
              return (
                <Pressable
                  key={h.entry.id}
                  onPress={() => pick(h)}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${h.via ? `${h.via}, ` : ""}${h.entry.name}. ${reviewed ? "Reviewed" : "Not reviewed yet"}`}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.row, (i === active || hovered) && styles.rowActive]}
                >
                  <View style={styles.rowTop}>
                    <T v="heading" style={{ flexShrink: 1 }}>
                      {h.via ? `${h.via} → ${h.entry.name}` : h.entry.name}
                    </T>
                    <View style={[styles.badge, reviewed ? styles.badgeOn : null]}>
                      <T v="tag" style={{ color: reviewed ? color.paper : color.inkSoft }}>
                        {reviewed ? "REVIEWED" : h.entry.kind === "supplement" ? "SUPPLEMENT · NOT REVIEWED" : "NOT REVIEWED YET"}
                      </T>
                    </View>
                  </View>
                  <T v="small" numberOfLines={1}>
                    {[reviewed?.drugClass, brands.length ? `Also sold as ${brands.join(", ")}` : null].filter(Boolean).join(" · ") || " "}
                  </T>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", zIndex: 20, minWidth: 260, flexShrink: 1 },
  field: { flexDirection: "row", alignItems: "center", gap: space[2], borderWidth: 2, borderColor: color.ink, paddingHorizontal: space[3], minHeight: 44, backgroundColor: color.paper },
  fieldFocused: { borderColor: color.focus },
  inputLg: { fontSize: size.lg, paddingVertical: space[3] },
  fieldLg: { minHeight: 60, paddingHorizontal: space[4] },
  menuLg: { top: 62 },
  input: { flex: 1, fontFamily: font.medium, fontSize: size.md, color: color.ink, paddingVertical: space[2], outlineStyle: "none" } as object,
  menu: { position: "absolute", top: 46, left: 0, right: 0, backgroundColor: color.paper, borderWidth: 2, borderColor: color.ink, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  row: { paddingHorizontal: space[3], paddingVertical: space[2], gap: 2, minHeight: 52, justifyContent: "center" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space[2], justifyContent: "space-between" },
  rowActive: { backgroundColor: color.paperDeep },
  badge: { borderWidth: 1, borderColor: color.inkFaint, paddingHorizontal: 5, paddingVertical: 1 },
  badgeOn: { backgroundColor: color.ink, borderColor: color.ink },
});
