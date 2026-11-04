import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowLeft, Play, Radio, RotateCcw, Square } from "lucide-react-native";
import type { Claim, EdgeCard, EvidenceRecord, PairKey, TraceEvent } from "@/shared/contract";
import { useLiveRun } from "@/ui/useLiveRun";
import { DISCLAIMER, color, font, space } from "@/ui/theme";
import { QuoteBlock } from "./EvidencePanel";
import { T } from "./T";

type Timed = TraceEvent & { t: number };

const modelName = (id: string) =>
  id
    .replace(/^meta-models\//, "")
    .replace("muse-spark-open-1026", "Muse Spark Open")
    .replace(/^muse-wonder-(\d\.\d)$/, "Muse Wonder $1")
    .replace(/^muse-spark-(\d\.\d)$/, "Muse Spark $1");

interface Props {
  pair: PairKey;
  record: EvidenceRecord | null;
  onBack: () => void;
  onLiveCard?: (card: EdgeCard, trace: Timed[]) => void;
  /** Stream from another endpoint (e.g. /api/request) instead of the curated pair's live run. */
  streamUrl?: string;
  autoStart?: boolean;
  title?: string;
}

export function AuditTrail({ pair, record, onBack, onLiveCard, streamUrl, autoStart, title }: Props) {
  const live = useLiveRun(pair, onLiveCard, streamUrl);
  // Planted false claims exist only for the curated demo pair (the server refuses them elsewhere).
  const canPlant = !streamUrl && pair === "alcohol__metronidazole";
  const [planted, setPlanted] = useState(canPlant);
  useEffect(() => {
    if (autoStart) live.start({ inject: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isLive = live.running || live.events.length > 0;
  const events = isLive ? live.events : record?.trace ?? [];
  const card = live.card ?? record?.card ?? null;
  const claims = isLive ? live.claims : card?.claims ?? [];
  const [shown, setShown] = useState(events.length);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => setShown(events.length), [events.length]);

  const replay = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShown(0);
    setPlaying(true);
    events.forEach((e, i) => {
      timers.current.push(
        setTimeout(() => {
          setShown(i + 1);
          if (i === events.length - 1) setPlaying(false);
        }, e.t * 0.6),
      );
    });
  };

  const verdicts = useMemo(() => ledger(claims), [claims]);
  const sources = useMemo(() => new Map((card?.sources ?? []).map((s) => [s.id, s])), [card]);
  const models = card?.models ?? record?.card.models;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to evidence" hitSlop={10} style={styles.iconBtn}>
          <ArrowLeft size={22} color={color.ink} strokeWidth={2.25} />
        </Pressable>
        <T v="heading" style={{ flex: 1 }} accessibilityRole="header">
          {title ?? "How this card was built"}
        </T>
        {!isLive && record && (
          <Pressable onPress={replay} accessibilityRole="button" style={({ pressed }) => [styles.replay, pressed && { backgroundColor: color.paperDeep }]}>
            {playing ? <RotateCcw size={16} color={color.ink} strokeWidth={2.25} /> : <Play size={16} color={color.ink} strokeWidth={2.25} />}
            <T v="heading" style={{ fontSize: 14 }}>{playing ? "Replaying" : "Replay run"}</T>
          </Pressable>
        )}
      </View>

      <View style={styles.liveBar}>
        <Pressable
          onPress={() => (live.running ? live.stop() : live.start({ inject: canPlant && planted }))}
          accessibilityRole="button"
          style={({ pressed }) => [styles.liveBtn, live.running && styles.liveBtnOn, pressed && { opacity: 0.85 }]}
        >
          {live.running ? <Square size={14} color={color.paper} strokeWidth={2.5} /> : <Radio size={16} color={color.paper} strokeWidth={2.25} />}
          <T v="heading" style={{ color: color.paper, fontSize: 14 }}>
            {live.running ? "Stop" : "Run the agent live"}
          </T>
        </Pressable>
        {canPlant && (
        <Pressable
          onPress={() => setPlanted((v) => !v)}
          disabled={live.running}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: planted, disabled: live.running }}
          style={styles.check}
        >
          <View style={[styles.box, planted && styles.boxOn]} />
          <T v="small" style={{ color: color.ink }}>
            Plant two false claims
          </T>
        </Pressable>
        )}
      </View>
      {live.error && (
        <View style={styles.errorBar} accessibilityRole="alert">
          <T v="small" style={{ color: color.paper }}>
            {live.error}
          </T>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.models}>
          {models && (
            <>
              <ModelLine role="Research agent" id={models.research} />
              <ModelLine role="Independent judge" id={models.judge} />
              <ModelLine role="Card writer" id={models.synth} />
            </>
          )}
        </View>

        <T v="small" style={{ color: color.ink }}>
          Every claim needs a quote. Quotes are matched word for word against the stored source text, then a separate model checks whether the quote supports the claim. Only claims that pass both appear on the card.
        </T>

        <View style={styles.rail}>
          <View style={styles.railLine} />
          {events.slice(0, shown).map((e, i) => (
            <Event key={i} e={e} />
          ))}
        </View>

        <View style={styles.sectionRule} />
        <T v="heading" accessibilityRole="header">
          Claim ledger
        </T>
        {verdicts.length === 0 && <T v="small">No claims yet.</T>}
        {verdicts.map(({ claim, kept, reason, pending }) => (
          <View key={claim.id} style={styles.claim}>
            <View style={styles.claimHead}>
              <View style={[styles.mark, pending ? styles.markPending : kept ? styles.markKept : styles.markRejected]} />
              <T v="tag" style={{ color: kept || pending ? color.ink : color.inkSoft }}>
                {claim.id.toUpperCase()} · {pending ? "CHECKING" : kept ? "KEPT" : `REJECTED: ${reason.toUpperCase()}`}
              </T>
              {claim.injected && (
                <View style={styles.planted}>
                  <T v="tag" style={{ color: color.paper }}>
                    PLANTED TEST CLAIM
                  </T>
                </View>
              )}
            </View>
            <T v="body" style={!kept && !pending && styles.struck}>
              {claim.text}
            </T>
            <QuoteBlock claim={claim} source={sources.get(claim.source.id)} />
            {claim.judgeRationale ? <T v="meta">Judge: {claim.judgeRationale}</T> : null}
          </View>
        ))}

        <T v="meta" style={{ marginTop: space[5] }}>
          {DISCLAIMER}
        </T>
      </ScrollView>
    </View>
  );
}

function ledger(claims: Claim[]) {
  return claims.map((claim) => ({
    claim,
    pending: (claim as Claim & { pending?: boolean }).pending === true,
    kept: claim.accepted,
    reason: claim.quoteCheck === "not_found" ? "quote not in source" : (claim.support ?? "unchecked").replace(/_/g, " "),
  }));
}

function ModelLine({ role, id }: { role: string; id: string }) {
  return (
    <View style={styles.modelLine}>
      <T v="small" style={{ width: 132 }}>
        {role}
      </T>
      <T v="small" style={{ color: color.ink, fontFamily: font.semibold }}>
        {modelName(id)}
      </T>
    </View>
  );
}

function Event({ e }: { e: Timed }) {
  const [tag, text, weak, form] = describe(e);
  return (
    <View style={styles.event}>
      <View style={[styles.tick, form === "half" && styles.tickHalf, form === "struck" && styles.tickStruck, form === "double" && styles.tickDouble]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="tag" style={{ color: weak ? color.inkFaint : color.ink }}>
          {tag}
        </T>
        {text ? (
          <T v="small" style={[{ color: weak ? color.inkSoft : color.ink }, form === "struck" && styles.struck]}>
            {text}
          </T>
        ) : null}
      </View>
      <T v="meta" style={styles.time}>
        {(e.t / 1000).toFixed(1)}s
      </T>
    </View>
  );
}

type Form = "full" | "half" | "struck" | "double";

function describe(e: Timed): [string, string, boolean, Form] {
  switch (e.type) {
    case "run_started":
      return ["RUN STARTED", "", true, "half"];
    case "thinking":
      return ["AGENT", e.text, true, "half"];
    case "tool_call":
      return [`CALL ${e.name}${e.parallelGroup ? " · PARALLEL" : ""}`, compact(e.args), false, e.parallelGroup ? "double" : "full"];
    case "tool_result":
      return ["RESULT", e.summary, true, "half"];
    case "claim_proposed":
      return [`CLAIM ${e.claim.id.toUpperCase()} PROPOSED${e.claim.injected ? " · PLANTED" : ""}`, e.claim.text, false, "full"];
    case "gap_recorded":
      return ["GAP RECORDED", e.gap.text, false, "full"];
    case "quote_checked":
      return [`QUOTE ${e.result === "matched" ? "MATCHED" : "NOT FOUND"} · ${e.claimId.toUpperCase()}`, "", e.result === "matched", e.result === "matched" ? "half" : "struck"];
    case "claim_judged":
      return [`JUDGED ${e.claimId.toUpperCase()} · ${e.support.replace(/_/g, " ").toUpperCase()}`, e.rationale, false, e.support === "supports" || e.support === "partial" ? "full" : "struck"];
    case "checkpoint":
      return ["CONTINUING IN THE NEXT PHASE", "", true, "half"];
    case "card_ready":
      return ["CARD WRITTEN", "", false, "full"];
    case "error":
      return [e.recoverable ? "PROBLEM, RETRYING" : "RUN STOPPED", e.message, false, "full"];
  }
}

function compact(args: Record<string, unknown>) {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("  ·  ");
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper },
  head: { flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderBottomWidth: 2, borderBottomColor: color.ink },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -space[2] },
  liveBar: { flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[5], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: color.ink, flexWrap: "wrap" },
  liveBtn: { flexDirection: "row", alignItems: "center", gap: space[2], backgroundColor: color.ink, paddingHorizontal: space[4], minHeight: 40 },
  liveBtnOn: { backgroundColor: "#D62F1F" },
  check: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 40 },
  box: { width: 18, height: 18, borderWidth: 2, borderColor: color.ink },
  boxOn: { backgroundColor: color.ink },
  errorBar: { backgroundColor: color.ink, paddingHorizontal: space[5], paddingVertical: space[2] },
  markPending: { backgroundColor: color.ruleFaint },
  replay: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: color.ink, paddingHorizontal: space[3], minHeight: 36 },
  body: { padding: space[5], gap: space[4], paddingBottom: space[7] },
  models: { gap: 2 },
  modelLine: { flexDirection: "row", alignItems: "baseline" },
  rail: { position: "relative", gap: space[3], paddingVertical: space[2] },
  railLine: { position: "absolute", left: 7, top: 0, bottom: 0, width: 1, backgroundColor: color.ink },
  event: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  tick: { width: 15, height: 3, backgroundColor: color.ink, marginTop: 6 },
  tickHalf: { width: 8, marginLeft: 4 },
  tickStruck: { backgroundColor: color.paper, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.inkSoft, height: 5 },
  tickDouble: { height: 7, backgroundColor: "transparent", borderTopWidth: 2, borderBottomWidth: 2, borderColor: color.ink },
  time: { width: 40, textAlign: "right", fontVariant: ["tabular-nums"] },
  sectionRule: { height: 2, backgroundColor: color.ink, marginTop: space[4] },
  claim: { gap: space[2], paddingBottom: space[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.ruleFaint },
  claimHead: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  mark: { width: 24, height: 4 },
  markKept: { backgroundColor: color.ink },
  markRejected: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.inkSoft, height: 6 },
  struck: { textDecorationLine: "line-through", textDecorationColor: color.inkSoft, color: color.inkSoft },
  planted: { backgroundColor: color.ink, paddingHorizontal: 6, paddingVertical: 1 },
});
