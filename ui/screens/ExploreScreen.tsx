import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, List, Network, X } from "lucide-react-native";
import type { CatalogEntry, EdgeCard, EvidenceRecord, PairKey, Substance, SubstanceId } from "@/shared/contract";
import { edges as curatedEdges } from "@/data/edges";
import { substances as allSubstances } from "@/data/substances";
import { AuditTrail } from "@/ui/components/AuditTrail";
import { ComboList, batchCombos, combosWith, withFest, type ComboItem } from "@/ui/components/ComboList";
import { FestPairView } from "@/ui/components/Fest";
import { festFor, useFest } from "@/ui/fest";
import { EvidencePanel } from "@/ui/components/EvidencePanel";
import { InteractionIndex, order } from "@/ui/components/InteractionIndex";
import { Legend } from "@/ui/components/Legend";
import { RankedPairs } from "@/ui/components/RankedPairs";
import { RequestReview } from "@/ui/components/RequestReview";
import { ScanButton } from "@/ui/components/ScanButton";
import { PairTitle, Section } from "@/ui/components/Section";
import { SignalMeter } from "@/ui/components/SignalMeter";
import { SlideIn } from "@/ui/components/SlideIn";
import { SubstanceSearch } from "@/ui/components/SubstanceSearch";
import { T } from "@/ui/components/T";
import { ThemeToggle } from "@/ui/components/ThemeToggle";
import { InteractionGraph } from "@/ui/graph/InteractionGraph";
import { graphEdges, undocumentedPairs } from "@/ui/model";
import { useBatchIndex } from "@/ui/batch";
import { brandList, useCatalog } from "@/ui/catalog";
import { useRecent } from "@/ui/recent";
import { requestKey, useRequested } from "@/ui/requested";
import { HomeView } from "@/ui/screens/HomeView";
import { NOTHING_DOCUMENTED, checkDidNotFinish, displayName } from "@/ui/signal";
import { DISCLAIMER, breakpoint, color, font, size, space } from "@/ui/theme";
import { useEvidenceMap } from "@/ui/useEvidence";

const byId = new Map(allSubstances.map((s) => [s.id, s]));

export function ExploreScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= breakpoint.wide;
  const roomy = width >= 1320;

  const params = useLocalSearchParams<{ s?: string; e?: string }>();
  const catalog = useCatalog();
  const catalogById = useMemo(() => new Map((catalog ?? []).map((e) => [e.id, e])), [catalog]);
  // Every id in the URL: reviewed substances plus catalogue entries we haven't reviewed yet.
  const ids = useMemo(
    () => (params.s ? [...new Set(params.s.split(","))].filter((id) => id && (byId.has(id) || catalogById.has(id) || !catalog)) : []),
    [params.s, catalogById, catalog],
  );
  const chosen = useMemo(() => ids.filter((id) => byId.has(id)), [ids]);
  /** For a drug with no reviewed cards: alcohol first, then the most common medicines, then reviewed ones. */
  const suggestionsFor = (id: string): { id: string; label: string; reviewed: boolean }[] => {
    const out: { id: string; label: string; reviewed: boolean }[] = [{ id: "alcohol", label: "Alcohol", reviewed: true }];
    const seen = new Set([id, "alcohol"]);
    // The catalogue is alphabetical, not ranked by use, so only the reviewed (commonly used) substances are offered.
    for (const sub of allSubstances) {
      if (seen.has(sub.id)) continue;
      seen.add(sub.id);
      out.push({ id: sub.id, label: displayName(sub), reviewed: true });
    }
    return out.slice(0, 16);
  };
  const unreviewed = useMemo(() => ids.filter((id) => !byId.has(id)), [ids]);
  const batchIndex = useBatchIndex();
  const batchPairs = useMemo(() => new Set(batchIndex.map((r) => r.pair)), [batchIndex]);
  /** List title for any id: "Tylenol (acetaminophen)" for reviewed substances, the generic name for catalogue entries. */
  const titleOf = useCallback(
    (id: string) => {
      const s = byId.get(id);
      if (s) return displayName(s);
      const e = catalogById.get(id);
      if (!e) return id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
      // The catalogue's first brand is often an obscure one (e.g. "Diskets" for methadone), so lists use the generic name.
      return e.name;
    },
    [catalogById],
  );
  const batchFor = useCallback((id: string) => batchCombos(batchIndex, id, titleOf), [batchIndex, titleOf]);
  // Norway's interaction database: the first id's file covers every FEST pair that includes it.
  const festFile = useFest(ids.length <= 2 ? ids[0] : null);
  const festPair = ids.length === 2 ? festFor(festFile, ids[1]) : [];
  const nameOf = (id: string) => {
    const s = byId.get(id);
    return s ? (s.brands?.[0] ?? s.name) : (catalogById.get(id)?.name ?? id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));
  };
  const selected = (params.e as PairKey | undefined) ?? null;
  const [view, setView] = useState<"card" | "audit">("card");
  const [multiView, setMultiView] = useState<"list" | "map">("list");
  const { recent, push } = useRecent();

  const setChosen = useCallback((ids: SubstanceId[]) => {
    setView("card");
    router.setParams({ s: ids.join(",") || undefined, e: undefined });
  }, []);
  const select = useCallback((pair: PairKey | null) => {
    setView("card");
    router.setParams({ e: pair ?? undefined });
  }, []);

  const pairs = useMemo(() => curatedEdges.filter((e) => chosen.includes(e.a) && chosen.includes(e.b)).map((e) => e.pair), [chosen]);
  const fetched = useEvidenceMap(pairs);
  const [liveRecords, setLiveRecords] = useState<Partial<Record<PairKey, EvidenceRecord>>>({});
  const records = useMemo(() => ({ ...fetched, ...liveRecords }), [fetched, liveRecords]);
  const cards = useMemo(() => Object.fromEntries(Object.entries(records).map(([k, r]) => [k, r!.card])), [records]);
  const edges = useMemo(() => graphEdges(chosen, curatedEdges, cards), [chosen, cards]);
  const onLiveCard = useCallback((card: EdgeCard, trace: EvidenceRecord["trace"]) => setLiveRecords((prev) => ({ ...prev, [card.pair]: { card, trace } })), []);
  const chosenSubs = useMemo(() => chosen.map((id) => byId.get(id)!), [chosen]);
  const undocumented = useMemo(() => undocumentedPairs(chosenSubs, edges), [chosenSubs, edges]);

  useEffect(() => {
    if (ids.length >= 2) push(ids);
  }, [ids, push]);

  const add = (id: SubstanceId) => !ids.includes(id) && setChosen([...ids, id]);
  const remove = (id: SubstanceId) => setChosen(ids.filter((x) => x !== id));

  // ---- Two substances: the evidence card IS the page ----
  const pairEdge = chosen.length === 2 ? edges[0] : undefined;
  const pairRecord = pairEdge ? records[pairEdge.pair] : undefined;

  // ---- Two substances that are NOT a curated pair: offer an agent review on request ----
  const reqKey = ids.length === 2 && !pairEdge ? requestKey(ids[0], ids[1]) : null;
  const requested = useRequested(reqKey);
  const batchKey = reqKey && batchPairs.has(reqKey) ? reqKey : null;
  const batchRecords = useEvidenceMap(batchKey ? [batchKey] : []);
  const batchRecord = batchKey ? batchRecords[batchKey] : undefined;
  const [requesting, setRequesting] = useState(false);
  useEffect(() => setRequesting(false), [reqKey]);
  const asSubstance = (id: string): Substance =>
    byId.get(id) ?? { id, name: catalogById.get(id)?.name ?? nameOf(id), kind: "rx", aliases: [], drugClass: "", brands: catalogById.get(id)?.brands.map((b) => b.name) };

  // ---- Three or more: graph + catalogue + side panel ----
  const focus = chosen.length > 2 && selected ? edges.find((e) => e.pair === selected) : undefined;
  const record = focus ? records[focus.pair] : undefined;
  const panel = focus ? (
    <SlideIn key={focus.pair} axis={wide ? "x" : "y"} style={wide ? styles.panelWide : styles.panelSheet}>
      {view === "audit" ? (
        <AuditTrail key={focus.pair} pair={focus.pair} record={record ?? null} onBack={() => setView("card")} onLiveCard={onLiveCard} />
      ) : record ? (
        (() => {
          const [first, second] = order(byId.get(focus.a), byId.get(focus.b));
          return <EvidencePanel card={record.card} catalog={focus.catalog} a={first!} b={second!} onClose={() => select(null)} onOpenAudit={() => setView("audit")} />;
        })()
      ) : (
        <PendingCard onClose={() => select(null)} onRun={() => setView("audit")} />
      )}
    </SlideIn>
  ) : null;

  const header = (
    <View style={[styles.header, !wide && styles.headerNarrow]}>
      <View style={styles.brandRow}>
        <Pressable onPress={() => setChosen([])} accessibilityRole="link" accessibilityLabel="Evidient, home" style={styles.brand}>
          <View style={styles.brandMark} />
          <T v="lead" style={{ fontFamily: font.bold, letterSpacing: -0.6 }}>
            Evidient
          </T>
        </Pressable>
        {!wide && (
          <View style={styles.headerTools}>
            {ids.length >= 2 && <ScanButton all={allSubstances} onFound={add} compact />}
            <ThemeToggle />
          </View>
        )}
      </View>
      {ids.length > 0 && (wide || ids.length !== 2) && (
        <View style={[styles.controls, !wide && styles.controlsNarrow]}>
          <View style={styles.chips}>
            {ids.map((id) => (
              <View key={id} style={[styles.chip, !byId.has(id) && styles.chipUnreviewed]}>
                <T v="heading">{nameOf(id)}</T>
                <Pressable onPress={() => remove(id)} accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(id)}`} hitSlop={10} style={styles.chipX}>
                  <X size={16} color={color.ink} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </View>
          {ids.length >= 2 && <SubstanceSearch all={allSubstances} chosen={ids} onAdd={add} placeholder="Add another" />}
          {wide && ids.length >= 2 && <ScanButton all={allSubstances} onFound={add} />}
        </View>
      )}
      {wide && <ThemeToggle />}
    </View>
  );

  let body: React.ReactNode;
  if (reqKey && view === "audit" && requested.record) {
    body = (
      <View style={styles.pageAudit}>
        <AuditTrail key={reqKey} pair={reqKey} record={requested.record} onBack={() => setView("card")} />
      </View>
    );
  } else if (reqKey && requested.record) {
    const [a, b] = order(asSubstance(ids[0]), asSubstance(ids[1])) as [Substance, Substance];
    body = (
      <SlideIn key={reqKey} axis="y" style={{ flex: 1 }}>
        <EvidencePanel page card={requested.record.card} catalog="" a={a} b={b} onClose={() => setChosen(ids.slice(0, 1))} onOpenAudit={() => setView("audit")} fest={festPair} festRetrieved={festFile?.retrieved} backLabel={nameOf(ids[0])} />
      </SlideIn>
    );
  } else if (batchKey && view === "audit" && batchRecord) {
    body = (
      <View style={styles.pageAudit}>
        <AuditTrail key={batchKey} pair={batchKey} record={batchRecord} onBack={() => setView("card")} />
      </View>
    );
  } else if (batchKey && !requesting) {
    const [a, b] = order(asSubstance(ids[0]), asSubstance(ids[1])) as [Substance, Substance];
    body = batchRecord ? (
      <SlideIn key={batchKey} axis="y" style={{ flex: 1 }}>
        <EvidencePanel page card={batchRecord.card} catalog="" a={a} b={b} onClose={() => setChosen(ids.slice(0, 1))} onOpenAudit={() => setView("audit")} fest={festPair} festRetrieved={festFile?.retrieved} backLabel={nameOf(ids[0])} />
      </SlideIn>
    ) : (
      <View style={{ flex: 1 }} />
    );
  } else if (reqKey && requesting) {
    body = (
      <View style={styles.pageAudit}>
        <AuditTrail
          key={`req-${reqKey}`}
          pair={reqKey}
          record={null}
          streamUrl={`/api/request?a=${encodeURIComponent(ids[0])}&b=${encodeURIComponent(ids[1])}`}
          autoStart
          title="Agent review in progress"
          onBack={() => setRequesting(false)}
          onLiveCard={(card, trace) => {
            if (!checkDidNotFinish(card)) requested.save({ card, trace });
          }}
        />
      </View>
    );
  } else if (ids.length === 2 && !pairEdge && festPair.length > 0) {
    const [a, b] = order(asSubstance(ids[0]), asSubstance(ids[1])) as [Substance, Substance];
    body = (
      <FestPairView
        key={reqKey}
        names={[a.name, b.name]}
        records={festPair}
        retrieved={festFile?.retrieved}
        wide={wide}
        onBack={() => setChosen(ids.slice(0, 1))}
        backLabel={nameOf(ids[0])}
        onRequest={() => setRequesting(true)}
      />
    );
  } else if (unreviewed.length > 0 && ids.length <= 2) {
    const entries = unreviewed.map((id) => catalogById.get(id)).filter((e): e is CatalogEntry => !!e);
    body = (
      <NotReviewed
        entries={entries}
        pendingNames={unreviewed.filter((id) => !catalogById.has(id)).map(nameOf)}
        reviewed={chosenSubs}
        wide={wide}
        onBack={ids.length > 1 ? () => setChosen(ids.slice(0, 1)) : undefined}
        onOpen={setChosen}
        onRequest={ids.length === 2 ? () => setRequesting(true) : undefined}
        suggestions={ids.length === 1 ? suggestionsFor(ids[0]) : []}
        researched={ids.length === 1 ? withFest(batchFor(ids[0]), festFile, ids[0], titleOf) : []}
      />
    );
  } else if (ids.length <= 1) {
    body = (
      <HomeView
        all={allSubstances}
        byId={byId}
        edges={curatedEdges}
        chosen={chosen}
        recent={recent}
        wide={wide}
        onAdd={add}
        onOpen={setChosen}
        researched={chosen[0] ? batchFor(chosen[0]) : []}
        fest={chosen[0] ? festFile : null}
        batch={batchIndex}
        titleOf={titleOf}
      />
    );
  } else if (chosen.length === 2) {
    const [a, b] = order(chosenSubs[0], chosenSubs[1]) as [Substance, Substance];
    const back = () => setChosen([chosen[0]]);
    body = pairEdge ? (
      view === "audit" ? (
        <View style={styles.pageAudit}>
          <AuditTrail key={pairEdge.pair} pair={pairEdge.pair} record={pairRecord ?? null} onBack={() => setView("card")} onLiveCard={onLiveCard} />
        </View>
      ) : pairRecord ? (
        <SlideIn key={pairEdge.pair} axis="y" style={{ flex: 1 }}>
          <EvidencePanel page card={pairRecord.card} catalog={pairEdge.catalog} a={a} b={b} onClose={back} onOpenAudit={() => setView("audit")} fest={festPair} festRetrieved={festFile?.retrieved} backLabel={nameOf(ids[0])} />
        </SlideIn>
      ) : (
        <PendingCard onClose={back} onRun={() => setView("audit")} />
      )
    ) : (
      <NothingDocumented a={a} b={b} wide={wide} onBack={back} onOpen={setChosen} onRequest={() => setRequesting(true)} />
    );
  } else {
    const note =
      unreviewed.length > 0 ? (
        <View style={styles.note}>
          <T v="small" style={{ color: color.ink }}>
            Not reviewed yet, so not included: {unreviewed.map(nameOf).join(", ")}.
          </T>
        </View>
      ) : null;
    const toggle = (
      <Pressable
        onPress={() => setMultiView((v) => (v === "list" ? "map" : "list"))}
        accessibilityRole="button"
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.viewToggle, hovered && { backgroundColor: color.hover }]}
      >
        {multiView === "list" ? <Network size={16} color={color.ink} strokeWidth={2.25} /> : <List size={16} color={color.ink} strokeWidth={2.25} />}
        <T v="small" style={{ color: color.ink, fontFamily: font.semibold }}>
          {multiView === "list" ? "Show as map" : "Show as list"}
        </T>
      </Pressable>
    );
    const overview = (
      <RankedPairs edges={edges} records={records} byId={byId} undocumented={undocumented} selected={selected} onSelect={select} />
    );
    body =
      multiView === "list" ? (
        <View style={{ flex: 1 }}>
          {note}
          <View style={styles.main}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.overview, !wide && { paddingHorizontal: space[4] }]}>
              <View style={styles.overviewTop}>{toggle}</View>
              {overview}
            </ScrollView>
            {wide && panel}
          </View>
          {!wide && panel}
        </View>
      ) : wide ? (
      <View style={{ flex: 1 }}>
        {note}
        <View style={styles.mapBar}>{toggle}</View>
        <View style={styles.main}>
        {(!focus || roomy) && (
          <ScrollView style={styles.index} contentContainerStyle={{ padding: space[5] }}>
            <InteractionIndex edges={edges} byId={byId} selected={selected} onSelect={select} undocumented={undocumented} />
          </ScrollView>
        )}
        <View style={styles.plateWrap}>
          <InteractionGraph substances={chosenSubs} edges={edges} selected={selected} onSelect={select} />
          <View style={styles.legend} pointerEvents="none">
            <Legend />
          </View>
        </View>
        {panel}
        </View>
      </View>
    ) : (
      <View style={{ flex: 1 }}>
        {note}
        <View style={styles.mapBar}>{toggle}</View>
        <ScrollView contentContainerStyle={{ paddingBottom: space[7] }}>
          <View style={styles.plateNarrow}>
            <InteractionGraph substances={chosenSubs} edges={edges} selected={selected} onSelect={select} />
          </View>
          <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
            <Legend />
            <InteractionIndex edges={edges} byId={byId} selected={selected} onSelect={select} undocumented={undocumented} />
          </View>
        </ScrollView>
        {panel}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      {body}
    </View>
  );
}

/** Two substances with no curated edge: say so plainly, then show what IS documented for each. */
function NothingDocumented({ a, b, wide, onBack, onOpen, onRequest }: { a: Substance; b: Substance; wide: boolean; onBack: () => void; onOpen: (ids: SubstanceId[]) => void; onRequest: () => void }) {
  const itemsA = useMemo(() => combosWith(a.id, curatedEdges, byId), [a.id]);
  const itemsB = useMemo(() => combosWith(b.id, curatedEdges, byId), [b.id]);
  const records = useEvidenceMap([...itemsA, ...itemsB].flatMap((i) => (i.edge ? [i.edge.pair] : [])));
  return (
    <ScrollView contentContainerStyle={[styles.nothing, !wide && { paddingHorizontal: space[4] }]}>
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.backRow}>
        <ArrowLeft size={18} color={color.ink} strokeWidth={2.25} />
        <T v="small" style={{ color: color.ink }}>
          {a.brands?.[0] ?? a.name}
        </T>
      </Pressable>
      <PairTitle a={a.name} b={b.name} />
      <View style={styles.nothingField}>
        <T style={styles.nothingText}>{NOTHING_DOCUMENTED.label}</T>
      </View>
      <T v="body" style={{ maxWidth: 640 }}>
        {NOTHING_DOCUMENTED.detail}
      </T>
      <RequestReview names={[a.name, b.name]} onRequest={onRequest} />
      {[
        { s: a, items: itemsA },
        { s: b, items: itemsB },
      ].map(({ s, items }) =>
        items.length ? (
          <Section key={s.id} title={`Documented with ${displayName(s)}`} count={items.length} wide={wide}>
            <ComboList items={items} records={records} onOpen={onOpen} limit={5} />
          </Section>
        ) : null,
      )}
      <T v="meta">{DISCLAIMER}</T>
    </ScrollView>
  );
}

/** Catalogue entries Evidient has not reviewed: never "nothing documented", always "not reviewed yet". */
function NotReviewed({
  entries,
  pendingNames,
  reviewed,
  wide,
  onBack,
  onOpen,
  onRequest,
  suggestions = [],
  researched = [],
  norway = [],
}: {
  /** Norway's interaction database rows for this substance (pairs not listed above). */
  norway?: ComboItem[];
  suggestions?: { id: string; label: string; reviewed: boolean }[];
  /** Agent-built cards that include this substance. */
  researched?: ComboItem[];
  entries: CatalogEntry[];
  pendingNames: string[];
  reviewed: Substance[];
  wide: boolean;
  onBack?: () => void;
  onOpen: (ids: SubstanceId[]) => void;
  onRequest?: () => void;
}) {
  const names = [...entries.map((e) => e.name), ...pendingNames];
  const items = useMemo(() => reviewed.flatMap((r) => combosWith(r.id, curatedEdges, byId)), [reviewed]);
  const records = useEvidenceMap(items.flatMap((i) => (i.edge ? [i.edge.pair] : [])));
  const hasResearch = (researched.length > 0 || norway.length > 0) && entries.length === 1;
  const covered = new Set(researched.flatMap((i) => i.ids));
  const rest = suggestions.filter((sg) => !covered.has(sg.id));
  return (
    <ScrollView contentContainerStyle={[styles.nothing, !onBack && reviewed.length === 0 && { maxWidth: 880 }, !wide && { paddingHorizontal: space[4] }]}>
      {onBack && (
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.backRow}>
          <ArrowLeft size={18} color={color.ink} strokeWidth={2.25} />
          <T v="small" style={{ color: color.ink }}>
            Back
          </T>
        </Pressable>
      )}
      {reviewed.length + names.length === 2 ? (
        <PairTitle a={[...reviewed.map((r) => r.name), ...names][0]} b={[...reviewed.map((r) => r.name), ...names][1]} />
      ) : (
        <View style={styles.drugTop}>
          <T v={wide ? "display" : "title"} accessibilityRole="header">
            {names[0]}
          </T>
          {entries[0] && brandList(entries[0], 4).length > 0 && (
            <T v="lead" style={{ color: color.inkSoft }}>
              {(() => {
                const b = brandList(entries[0], 4);
                return b.length > 4 ? `Sold as ${b.slice(0, 3).join(", ")} and ${b.length - 3} more` : `Sold as ${b.join(", ")}`;
              })()}
            </T>
          )}
          {entries[0] && (
            <View style={[styles.addBar, !wide && { flexDirection: "column", alignItems: "stretch" }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SubstanceSearch all={allSubstances} chosen={[entries[0].id]} onAdd={(id) => onOpen([entries[0].id, id])} size="lg" placeholder="Add alcohol or a medicine" />
              </View>
              <ScanButton all={allSubstances} onFound={(id) => onOpen([entries[0].id, id])} size="lg" />
            </View>
          )}
        </View>
      )}
      {hasResearch && researched.length > 0 && (
        <Section title={`Documented with ${names[0]}`} count={researched.length} note="Strongest warning first." wide={wide}>
          <ComboList items={researched} records={{}} onOpen={onOpen} limit={6} />
        </Section>
      )}
      {!hasResearch && (
        <>
          <View style={styles.nothingField}>
            <T style={styles.nothingText}>Not reviewed yet</T>
          </View>
          <T v="body" style={{ maxWidth: 640 }}>
            Evidient hasn’t checked the labels and studies for {names.join(" and ")}. This is not the same as “nothing documented”: the evidence may exist, we just haven’t reviewed it.
          </T>
        </>
      )}
      {onRequest && <RequestReview names={[...reviewed.map((r) => r.name), ...names]} onRequest={onRequest} />}
      {entries.map((e) => {
        const brands = brandList(e, 6);
        return (
          <View key={e.id} style={{ gap: space[2] }}>
            {brands.length > 0 && (onBack || reviewed.length > 0) && (
              <T v="small">
                {e.name} is sold as {brands.join(", ")}.
              </T>
            )}
            <Pressable onPress={() => Linking.openURL(e.labelUrl)} accessibilityRole="link" style={({ pressed }) => [styles.labelBtn, pressed && { opacity: 0.85 }]}>
              <T v="heading" style={{ color: color.paper }}>
                Read the official label for {e.name}
              </T>
              <ArrowUpRight size={18} color={color.paper} strokeWidth={2.25} />
            </Pressable>
          </View>
        );
      })}
      {rest.length > 0 && entries[0] && (
        <View style={{ gap: space[3] }}>
          <View style={{ gap: space[1] }}>
            <T v="heading" style={{ fontSize: size.lg }} accessibilityRole="header">
              Not reviewed yet with {entries[0].name}
            </T>
            <T v="small">Open one to have the agent read the labels and studies.</T>
          </View>
          <View style={styles.suggestList}>
            {rest.map((sg) => (
              <Pressable
                key={sg.id}
                onPress={() => onOpen([entries[0].id, sg.id])}
                accessibilityRole="button"
                accessibilityLabel={`${entries[0].name} and ${sg.label}`}
                style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.suggestRow, (hovered || pressed) && { backgroundColor: color.hover }]}
              >
                <T v="body" style={{ flex: 1, fontFamily: font.medium }}>
                  {sg.label}
                </T>
                <ArrowRight size={18} color={color.ink} strokeWidth={2.25} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {reviewed.map((r) => {
        const own = items.filter((i) => i.ids[0] === r.id);
        return own.length ? (
          <View key={r.id} style={{ gap: space[3] }}>
            <T v="heading" style={{ fontSize: size.lg }}>
              What is documented with {displayName(r)}
            </T>
            <ComboList items={own} records={records} onOpen={onOpen} />
          </View>
        ) : null;
      })}
      <T v="meta">{DISCLAIMER}</T>
    </ScrollView>
  );
}

function PendingCard({ onClose, onRun }: { onClose: () => void; onRun: () => void }) {
  return (
    <View style={{ flex: 1, padding: space[5], gap: space[3], maxWidth: 720, width: "100%", alignSelf: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T v="heading">This card isn't written yet</T>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
          <X size={22} color={color.ink} strokeWidth={2.25} />
        </Pressable>
      </View>
      <T v="body">These two are on our list of known interactions, but this card hasn't been written yet.</T>
      <Pressable onPress={onRun} accessibilityRole="button" style={({ pressed }) => [styles.runBtn, pressed && { opacity: 0.85 }]}>
        <T v="heading" style={{ color: color.paper }}>
          Run the agent now
        </T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3], paddingHorizontal: space[5], paddingVertical: space[3], borderBottomWidth: 2, borderBottomColor: color.ink, zIndex: 10 },
  headerNarrow: { flexDirection: "column", alignItems: "stretch", gap: space[3], paddingHorizontal: space[4] },
  headerTools: { flexDirection: "row", alignItems: "center", gap: space[2] },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 44 },
  brandMark: { width: 18, height: 18, backgroundColor: color.ink },
  controls: { flexDirection: "row", alignItems: "center", gap: space[3], flexShrink: 1, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" },
  controlsNarrow: { flexDirection: "column", alignItems: "stretch", width: "100%" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  chip: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: color.paperDeep, paddingLeft: space[3], minHeight: 44 },
  chipUnreviewed: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: color.inkFaint, borderStyle: "dashed" },
  note: { paddingHorizontal: space[5], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: color.ink, backgroundColor: color.paperDeep },
  labelBtn: { flexDirection: "row", alignItems: "center", gap: space[2], alignSelf: "flex-start", backgroundColor: color.ink, paddingHorizontal: space[4], minHeight: 48 },
  suggestList: { borderTopWidth: 2, borderTopColor: color.rule },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 52, paddingHorizontal: space[2], marginHorizontal: -space[2], borderBottomWidth: 1, borderBottomColor: color.ruleFaint },
  chipX: { width: 36, height: 44, alignItems: "center", justifyContent: "center" },
  runBtn: { alignSelf: "flex-start", backgroundColor: color.ink, paddingHorizontal: space[4], minHeight: 44, justifyContent: "center", marginTop: space[3] },
  overview: { paddingHorizontal: space[6], paddingVertical: space[5], gap: space[3], width: "100%", maxWidth: 760, alignSelf: "center" },
  overviewTop: { flexDirection: "row", justifyContent: "flex-end" },
  viewToggle: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: color.ink, paddingHorizontal: space[3], minHeight: 36 },
  mapBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space[4], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: color.ruleFaint },
  main: { flex: 1, flexDirection: "row" },
  index: { width: 300, flexGrow: 0, borderRightWidth: 1, borderRightColor: color.ink },
  plateWrap: { flex: 1, position: "relative" },
  legend: { position: "absolute", left: space[5], bottom: space[4] },
  plateNarrow: { height: 380, borderBottomWidth: 1, borderBottomColor: color.ink, marginBottom: space[4] },
  panelWide: { width: 480, borderLeftWidth: 2, borderLeftColor: color.ink, backgroundColor: color.paper },
  panelSheet: { ...StyleSheet.absoluteFill, backgroundColor: color.paper, zIndex: 30 },
  pageAudit: { flex: 1, width: "100%", maxWidth: 760, alignSelf: "center", borderLeftWidth: 1, borderRightWidth: 1, borderColor: color.ink },
  nothing: { paddingHorizontal: space[7], paddingVertical: space[5], gap: space[6], maxWidth: 760, width: "100%", alignSelf: "center" },
  backRow: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 36, alignSelf: "flex-start", marginBottom: -space[3] },
  drugTop: { gap: space[4], paddingTop: space[5], marginBottom: space[4], zIndex: 20 },
  addBar: { flexDirection: "row", alignItems: "stretch", gap: space[3], marginTop: space[3], zIndex: 20 },
  nothingField: { paddingHorizontal: space[5], paddingVertical: space[4], backgroundColor: color.paperDeep },
  nothingSignal: { flexDirection: "row", alignItems: "center", gap: space[4], paddingVertical: space[3], borderTopWidth: 2, borderBottomWidth: 2, borderColor: color.ink },
  nothingText: { flex: 1, fontFamily: font.bold, fontSize: size.xl, lineHeight: 32, letterSpacing: -0.6, color: color.ink },
});
