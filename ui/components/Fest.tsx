import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowLeft, ArrowUpRight, Minus, Plus } from "lucide-react-native";
import type { FestRecord } from "@/shared/contract";
import { FEST_SOURCE, FEST_URL, festDate, festGrade } from "@/ui/fest";
import { DISCLAIMER, color, font, space } from "@/ui/theme";
import { rankOfFest } from "@/ui/verdict";
import { Kicker, Says, Verdict } from "./Verdict";
import { RequestReview } from "./RequestReview";
import { SignalMeter } from "./SignalMeter";
import { T } from "./T";

/** The strongest FEST grade among records, for headers and list rows. */
export const topGrade = (records: FestRecord[]) => [...records].sort((x, y) => x.relevance.localeCompare(y.relevance))[0]?.relevance ?? "3";

/** One or more FEST records, each with the Norwegian original under the English rendering. */
export function FestRecords({ records, retrieved, leadShown = false }: { records: FestRecord[]; retrieved?: string; leadShown?: boolean }) {
  return (
    <View style={{ gap: space[5] }}>
      {records.map((r) => (
        <FestRecordView key={r.id} r={r} many={records.length > 1} leadShown={leadShown && records.length === 1} />
      ))}
      <T v="meta">
        Source: {FEST_SOURCE}, record {records.map((r) => r.id.replace(/^ID_/, "").slice(0, 8)).join(", ")}
        {retrieved ? `, retrieved ${festDate(retrieved)}` : ""}. Licensed under the Norwegian Licence for Open Government Data (NLOD). English renderings were written by a coding agent; the Norwegian text is the source.
      </T>
    </View>
  );
}

function FestRecordView({ r, many, leadShown }: { r: FestRecord; many: boolean; leadShown: boolean }) {
  const g = festGrade[r.relevance];
  const [refs, setRefs] = useState(false);
  return (
    <View style={styles.record}>
      {many && (
        <View style={styles.gradeRow}>
          <SignalMeter bars={g.bars} size="sm" on={g.mark} />
          <T v="small" style={{ color: color.ink, fontFamily: font.semibold }}>
            {g.en} · <T v="small">“{r.relevanceLabel}”</T>
          </T>
        </View>
      )}
      <T v="meta">
        {r.sides[0]} with {r.sides[1]}
      </T>
      {r.situation && <Bilingual label="When" en={r.situationEnglish} nb={r.situation} />}
      {leadShown ? (
        <Bilingual label="What happens, Norwegian original" nb={r.consequence} original />
      ) : (
        <Bilingual label="What happens" en={r.consequenceEnglish} nb={r.consequence} strong />
      )}
      {r.mechanism?.trim() ? <Bilingual label="Why" en={r.mechanismEnglish} nb={r.mechanism} /> : null}
      <T v="small">
        Based on: {r.basisEnglish ?? r.basis}
        {r.basisEnglish ? ` (${r.basis})` : ""} · updated {festDate(r.updated)}
      </T>
      {r.references.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Pressable onPress={() => setRefs((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: refs }} style={styles.refToggle}>
            <T v="small" style={{ color: color.ink, textDecorationLine: "underline" }}>
              {refs ? "Hide" : "Show"} {r.references.length} {r.references.length === 1 ? "reference" : "references"}
            </T>
          </Pressable>
          {refs &&
            r.references.map((ref, i) =>
              ref.url ? (
                <Pressable key={i} onPress={() => Linking.openURL(ref.url!)} accessibilityRole="link">
                  <T v="small" style={{ color: color.ink, textDecorationLine: "underline" }}>
                    {ref.text}
                  </T>
                </Pressable>
              ) : (
                <T key={i} v="small">
                  {ref.text}
                </T>
              ),
            )}
        </View>
      )}
    </View>
  );
}

function Bilingual({ label, en, nb, strong = false, original = false }: { label: string; en?: string; nb: string; strong?: boolean; original?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <T v="meta" style={{ fontFamily: font.semibold, color: color.inkSoft }}>
        {label}
      </T>
      {en ? (
        <>
          <T v="body" style={strong ? { fontFamily: font.medium } : undefined}>
            {en}
          </T>
          <T v="small" style={{ fontStyle: "italic" }}>
            {nb}
          </T>
        </>
      ) : original ? (
        <T v="small" style={{ fontStyle: "italic" }}>
          {nb}
        </T>
      ) : (
        <T v="body" style={strong ? { fontFamily: font.medium } : undefined}>
          {nb}
        </T>
      )}
    </View>
  );
}

/** Pair page when Norway's database has this pair but Evidient has no card for it. */
export function FestPairView({
  names,
  records,
  retrieved,
  wide,
  onBack,
  backLabel,
  onRequest,
}: {
  names: [string, string];
  records: FestRecord[];
  retrieved?: string;
  wide: boolean;
  onBack: () => void;
  backLabel: string;
  onRequest: () => void;
}) {
  const top = records.find((r) => r.relevance === topGrade(records)) ?? records[0];
  const g = festGrade[top.relevance];
  const rank = rankOfFest(top.relevance);
  return (
    <ScrollView contentContainerStyle={[styles.page, !wide && { paddingHorizontal: space[4] }]}>
      <Pressable onPress={onBack} accessibilityRole="link" style={styles.backRow}>
        <ArrowLeft size={18} color={color.ink} strokeWidth={2.25} />
        <T v="small" style={{ color: color.ink }}>
          {backLabel}
        </T>
      </Pressable>
      <T v="title" accessibilityRole="header">
        {names[0]}
        {"\n"}
        <T v="title" style={{ color: color.inkSoft, fontFamily: font.medium }}>
          with {names[1].toLowerCase()}
        </T>
      </T>
      <Verdict rank={rank} because={`Norway’s interaction database: “${g.en}”. Evidient hasn’t read the FDA labels for this pair yet.`} />
      <View style={styles.block}>
        <Kicker>What happens</Kicker>
        <T v="lead">{top.consequenceEnglish ?? top.consequence}</T>
      </View>
      <View>
        <Kicker>Who says so</Kicker>
        <View style={{ height: space[2] }} />
        <Says who="Norway’s interaction database" rating={g.en} rank={rank}>
          <T v="small">
            Rated by DMP, Norway’s medicines agency. Updated {festDate(top.updated)}.
          </T>
        </Says>
        <View style={{ height: 1, backgroundColor: color.ruleFaint }} />
      </View>
      <RequestReview names={names} onRequest={onRequest} />
      <View style={styles.more}>
        <Disclosure title="Norway’s full entry" summary="Why it happens, what it’s based on and references, with the Norwegian original">
          <FestRecords records={records} retrieved={retrieved} />
          <Pressable onPress={() => Linking.openURL(FEST_URL)} accessibilityRole="link" style={styles.srcLink}>
            <T v="small" style={{ color: color.ink, textDecorationLine: "underline" }}>
              FEST data download (dmp.no)
            </T>
            <ArrowUpRight size={14} color={color.ink} strokeWidth={2.25} />
          </Pressable>
        </Disclosure>
      </View>
      <T v="meta">{DISCLAIMER}</T>
    </ScrollView>
  );
}

function Disclosure({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.disclosureHead, (pressed || hovered) && { backgroundColor: color.hover }]}
      >
        <View style={{ flex: 1 }}>
          <T v="heading">{title}</T>
          {!open && <T v="small">{summary}</T>}
        </View>
        {open ? <Minus size={20} color={color.ink} strokeWidth={2.25} /> : <Plus size={20} color={color.ink} strokeWidth={2.25} />}
      </Pressable>
      {open && <View style={{ gap: space[4], paddingBottom: space[4] }}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space[7], paddingVertical: space[5], gap: space[6], maxWidth: 760, width: "100%", alignSelf: "center" },
  block: { gap: space[3] },
  more: { borderTopWidth: 1, borderTopColor: color.ruleFaint, borderBottomWidth: 1, borderBottomColor: color.ruleFaint },
  disclosureHead: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 56, paddingVertical: space[2], paddingHorizontal: space[2], marginHorizontal: -space[2] },
  backRow: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 36, alignSelf: "flex-start", marginBottom: -space[3] },
  record: { gap: space[3], paddingLeft: space[3], borderLeftWidth: 2, borderLeftColor: color.rule },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  refToggle: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  srcLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 32 },
});
