import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { ArrowLeft, ArrowUpRight, Minus, Plus, X } from "lucide-react-native";
import type { Claim, EdgeCard, FestRecord, Sentence, SignalLevel, Source, StudyDesign, Substance } from "@/shared/contract";
import { festGrade } from "@/ui/fest";
import { FestRecords, topGrade } from "./Fest";
import { DISCLAIMER, NO_RISK_CAVEAT, color, font, lineForm, size, space, type LineForm } from "@/ui/theme";
import { labelSays, rankOfFest, rankOfLevel, tone, type Rank } from "@/ui/verdict";
import { Kicker, Says, Verdict } from "./Verdict";
import { checkDidNotFinish, prettyCitation, signalOf } from "@/ui/signal";
import { LineFormSample } from "./LineFormSample";
import { T } from "./T";

interface Props {
  card: EdgeCard;
  catalog: string;
  a: Substance;
  b: Substance;
  onClose: () => void;
  onOpenAudit: () => void;
  /** Full-page reading layout (two substances chosen) instead of the side panel. */
  page?: boolean;
  /** Norway's interaction database (FEST) records for the same pair. */
  fest?: FestRecord[];
  festRetrieved?: string;
  /** Page mode: what the back link returns to. */
  backLabel?: string;
}

const designLabel: Record<StudyDesign, string> = {
  regulatory_label: "Regulatory label",
  rct: "Randomized controlled trial",
  controlled_trial: "Controlled trial",
  cohort: "Cohort study",
  case_control: "Case-control study",
  case_series: "Case series",
  case_report: "Case report",
  review: "Review",
  mechanistic: "Mechanism study",
  animal: "Animal study",
  other: "Published study",
};

/** Whether a quote names the substance: its name, a brand or an alias (four letters or more, to skip noise). */
function mentions(s: Substance, text: string) {
  const t = text.toLowerCase();
  const names = [s.name, ...(s.aliases ?? []), ...(s.brands ?? []), ...(s.id === "alcohol" ? ["ethanol", "alcoholic"] : [])];
  return names.some((n) => n.length >= 4 && t.includes(n.toLowerCase()));
}

export function EvidencePanel({ card, catalog, a, b, onClose, onOpenAudit, page = false, fest = [], festRetrieved, backLabel }: Props) {
  const claims = useMemo(() => new Map(card.claims.map((c) => [c.id, c])), [card.claims]);
  const sources = useMemo(() => new Map(card.sources.map((s) => [s.id, s])), [card.sources]);

  // Quote keys are numbered in reading order of accepted claims.
  const keyOf = useMemo(() => {
    const order: string[] = [];
    const visit = (s: Sentence) => s.claimIds.forEach((id) => claims.get(id)?.accepted && !order.includes(id) && order.push(id));
    [card.headline, ...card.reported, ...card.mechanism, ...card.conflicts.map((c) => c.summary)].forEach(visit);
    return new Map(order.map((id, i) => [id, i + 1]));
  }, [card, claims]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Only sources behind accepted claims count as evidence on the card; the rest live in the audit trail.
  const citedSources = useMemo(() => {
    const ids = new Set(card.claims.filter((c) => c.accepted).map((c) => c.source.id));
    return card.sources.filter((s) => ids.has(s.id));
  }, [card]);

  const signal = signalOf(card);
  const foundNothing = !card.claims.some((c) => c.accepted);
  const unfinished = checkDidNotFinish(card);
  const basis = claims.get(signal.basis[0]);

  const accepted = card.claims.filter((c) => c.accepted).length;
  const rejected = card.claims.length - accepted;
  const ctx = { claims, sources, keyOf, open, toggle };

  const designs = [...new Set(citedSources.map((s) => (s.kind === "fda_label" ? "FDA label" : s.kind === "eu_smpc" ? "EU product information" : designLabel[s.design])))];
  const humanStudies = card.depth === "human_studies";
  const missingCount = card.gaps.length + (card.mechanism.length ? 0 : 1);
  // Statements beyond the headline; the headline already sits at the top.
  const reported = card.reported.filter((s) => s.text !== card.headline.text);
  const checked = new Date(card.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const [fullBasis, setFullBasis] = useState(false);
  const { width } = useWindowDimensions();
  const stack = !page || width < 640;
  const keptNote = accepted === card.claims.length ? "Every quote kept by a second model" : `${accepted} of ${card.claims.length} quotes kept by a second model`;
  const festTopRec = fest.length ? fest.find((r) => r.relevance === topGrade(fest)) : undefined;
  const fromCard: Rank = foundNothing ? 0 : rankOfLevel(signal.level);
  const fromFest: Rank = festTopRec ? rankOfFest(festTopRec.relevance) : 0;
  const rank = Math.max(fromCard, fromFest) as Rank;
  const labelClaims = card.claims.filter((c) => c.accepted && (c.source.kind === "fda_label" || c.source.kind === "eu_smpc"));
  const labelClaim = basis && labelClaims.includes(basis) ? basis : labelClaims[0];
  const labelSource = labelClaim ? sources.get(labelClaim.source.id) : undefined;
  const labelWho = labelSource?.kind === "eu_smpc" ? "European label" : "FDA label";
  // Labels often warn about a drug class ("CNS depressants") rather than the partner by name; say so.
  // The label's own drug counts as named: its title starts with it ("fentanyl: boxed_warning").
  const unnamed = labelClaim ? [a, b].filter((s) => !mentions(s, `${labelClaim.quote} ${labelClaim.quoteEnglish ?? ""} ${labelSource?.title ?? ""}`)) : [];
  const studyClaims = card.claims.filter((c) => c.accepted && c.source.kind === "pubmed");
  const studyCount = new Set(studyClaims.map((c) => c.source.id)).size;
  const studyClaim = studyClaims[0];
  const studySource = studyClaim ? sources.get(studyClaim.source.id) : undefined;
  const conflictSummary = card.conflicts[0]?.summary;

  const parts: string[] = [];
  if (labelClaim) parts.push(`The ${labelWho} ${labelSays[signal.level].toLowerCase()}.`);
  if (festTopRec) parts.push(`Norway’s database: “${festGrade[festTopRec.relevance].en}”.`);
  if (!labelClaim && studyCount) parts.push(`Only published studies report it.`);
  if (signal.conflict) parts.push("Sources disagree.");
  const because = unfinished
    ? "Passages were found, but the independent check was unavailable."
    : foundNothing && !festTopRec
      ? `No label or study the agent read describes this pair. ${NO_RISK_CAVEAT}`
      : parts.join(" ");
  // An empty card still records where the agent looked; that list is the result.
  const searched = foundNothing ? [...new Set(card.gaps.flatMap((g) => g.searched))].slice(0, 8) : [];
  const verdictLabel = rank ? undefined : unfinished ? "The check didn’t finish" : "Nothing found in what the agent checked";
  const labelExcerpt = labelClaim ? excerpt(labelClaim.quote, signal.level, [a.name, b.name]) : "";

  return (
    <View style={styles.panel}>
      {!page && (
        <View style={styles.panelBar}>
          <T v="tag" style={{ color: color.inkSoft, flex: 1 }}>
            {catalog ? `CARD ${catalog}` : "EVIDENCE CARD"}
          </T>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close evidence" hitSlop={12} style={styles.close}>
            <X size={22} color={color.ink} strokeWidth={2.25} />
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.body, page && styles.pageCol, page && styles.pageBody]}>
        {page && (
          <Pressable onPress={onClose} accessibilityRole="link" style={styles.backRow}>
            <ArrowLeft size={18} color={color.ink} strokeWidth={2.25} />
            <T v="small" style={{ color: color.ink }}>
              {backLabel ?? a.name}
            </T>
          </Pressable>
        )}

        <T v={page ? "title" : "heading"} style={!page && styles.panelTitle} accessibilityRole="header">
          {a.name}
          {page ? "\n" : " "}
          <T v={page ? "title" : "heading"} style={[!page && styles.panelTitle, { color: color.inkSoft, fontFamily: font.medium }]}>
            with {b.name.toLowerCase()}
          </T>
        </T>

        {/* 1. The answer. */}
        <Verdict rank={rank} label={verdictLabel} because={because} compact={!page} />

        {foundNothing && !unfinished && searched.length > 0 && (
          <View style={styles.block}>
            <Kicker>What the agent read</Kicker>
            {searched.map((s) => (
              <View key={s} style={styles.bulletRow}>
                <T v="body" style={styles.flex}>
                  {s}
                </T>
              </View>
            ))}
            {card.claims.length > 0 && (
              <T v="small">
                It proposed {card.claims.length} {card.claims.length === 1 ? "passage" : "passages"}. None held up when a second model checked the quote against the source.
              </T>
            )}
          </View>
        )}

        {/* 2. What happens, in one sentence. */}
        {!foundNothing && (
          <View style={styles.block}>
            <Kicker>What happens</Kicker>
            <SentenceView s={card.headline} ctx={ctx} lead />
          </View>
        )}

        {/* 3. Who says so, each source in its own words. */}
        {(labelClaim || festTopRec || studyClaim) && (
          <View>
            <Kicker>Who says so</Kicker>
            <View style={{ height: space[2] }} />
            {labelClaim && (
              <Says stack={stack} who={labelWho} rating={labelSays[signal.level]} rank={fromCard} url={labelSource?.url} linkLabel={labelSource ? prettyCitation(labelSource) : undefined}>
                <Highlighted text={fullBasis ? labelClaim.quote : labelExcerpt} level={signal.level} />
                {labelExcerpt !== labelClaim.quote && (
                  <T v="small" onPress={() => setFullBasis((v) => !v)} accessibilityRole="button" style={styles.textBtn}>
                    {fullBasis ? "Show the key sentence only" : "Show the full passage"}
                  </T>
                )}
                {labelClaim.quoteEnglish && labelSource?.language && labelSource.language !== "en" ? (
                  <T v="small">In English: “<Highlighted text={labelClaim.quoteEnglish} level={signal.level} inline />”</T>
                ) : null}
                {unnamed.length > 0 && (
                  <T v="small" style={{ color: color.ink }}>
                    This passage warns about a group of drugs and doesn’t name {unnamed.map((s) => s.name.toLowerCase()).join(" or ")}.
                  </T>
                )}
              </Says>
            )}
            {festTopRec && (
              <Says stack={stack} who="Norway’s interaction database" rating={festGrade[festTopRec.relevance].en} rank={fromFest}>
                <T v="body">{festTopRec.consequenceEnglish ?? festTopRec.consequence}</T>
              </Says>
            )}
            {studyClaim && (
              <Says
                stack={stack}
                who={studyCount === 1 ? "A published study" : `${studyCount} published studies`}
                rating={signal.conflict ? "Disagree with the label" : labelClaim ? (studyCount === 1 ? "What it found" : "What they found") : "Report it"}
                rank={labelClaim ? 0 : 1}
                url={studySource?.url}
                linkLabel={studySource ? prettyCitation(studySource) : undefined}
              >
                <T v="body">{clean(signal.conflict && conflictSummary ? conflictSummary.text : studyClaim.text)}</T>
              </Says>
            )}
            <View style={styles.rule1} />
          </View>
        )}

        {unfinished && (
          <View style={styles.conflictBox}>
            <View style={styles.flex}>
              <T v="heading">This is not a “nothing found” result.</T>
              <T v="small">The agent found passages that may describe an interaction, but the independent checker was unavailable, so none could be confirmed. Try the review again later.</T>
            </View>
          </View>
        )}

        {/* 4. What to do with it. */}
        {card.pharmacistQuestions.length > 0 && (
          <View style={styles.block}>
            <Kicker>Ask your pharmacist</Kicker>
            {card.pharmacistQuestions.map((q, i) => (
              <View key={i} style={styles.bulletRow}>
                <T v="tag" style={styles.qNum}>
                  {i + 1}
                </T>
                <T v="body" style={styles.flex}>
                  {/* Cards built before the no-interaction level carry a question that assumes an interaction. */}
                  {q.trigger === "label_only" || q.trigger === "no_human_data"
                    ? foundNothing
                      ? "Evidient found nothing on this pair in the labels and studies it read. Is there anything I should know about taking them together?"
                      : signal.level === "label_no_interaction"
                        ? "The label says no significant interaction is expected. Does anything about my health or my other medicines change that?"
                        : q.text
                    : q.text}
                </T>
              </View>
            ))}
          </View>
        )}

        {/* 5. Everything else, one tap away. */}
        <View style={styles.rows}>
          {(!foundNothing || fest.length > 0) && (
          <Disclosure title="All the evidence" summary={`Every quote and source${fest.length ? ", Norway’s full entry" : ""} and what’s missing`}>
            {!foundNothing && (
              <View style={[styles.specs, stack && styles.specsNarrow]}>
                <Spec
                  grow={!stack}
                  label="Evidence"
                  value={humanStudies ? "Human studies" : card.depth ? lineForm[card.depth].label : "Not assessed"}
                  note={humanStudies ? undefined : "No human study of this pair found"}
                  form={card.depth ?? undefined}
                  hue={tone(fromCard).mark}
                />
                <Spec grow={!stack} label="Sources" value={`${citedSources.length} · ${designs.join(", ")}`} />
                <Spec grow={!stack} label="Checked" value={checked} note={keptNote} />
              </View>
            )}

            {card.conflicts.map((c) => (
              <View key={c.outcome} style={styles.block}>
                <T style={styles.blockTitle}>Where sources disagree</T>
                <View style={[styles.halves, !page && { flexDirection: "column", gap: space[3] }]}>
                  <Half title="Reports it" ids={c.sideA} ctx={ctx} />
                  {page && (
                    <View style={styles.doubleRule}>
                      <View style={styles.rule} />
                      <View style={styles.rule} />
                    </View>
                  )}
                  <Half title="Did not observe it" ids={c.sideB} ctx={ctx} />
                </View>
                <SentenceView s={c.summary} ctx={ctx} />
              </View>
            ))}

            {reported.length > 0 && (
              <View style={styles.block}>
                <T style={styles.blockTitle}>Also reported</T>
                {reported.map((s, i) => (
                  <SentenceView key={i} s={s} ctx={ctx} />
                ))}
                <T v="meta">Tap a number to see the quote behind the sentence.</T>
              </View>
            )}

            {card.mechanism.length > 0 && (
              <View style={styles.block}>
                <T style={styles.blockTitle}>How it might happen</T>
                {card.mechanism.map((s, i) => (
                  <SentenceView key={i} s={s} ctx={ctx} />
                ))}
              </View>
            )}

            {fest.length > 0 && (
              <View style={styles.block}>
                <T style={styles.blockTitle}>Norway’s full entry</T>
                <FestRecords records={fest} retrieved={festRetrieved} />
              </View>
            )}

            {missingCount > 0 && (
              <View style={styles.block}>
                <T style={styles.blockTitle}>What’s missing</T>
                {card.mechanism.length === 0 && <T v="body">The sources don’t say why this happens.</T>}
                {card.gaps.map((g) => (
                  <View key={g.id} style={styles.gap}>
                    <T v="body">{g.text}</T>
                    <T v="meta">Searched: {g.searched.join(" · ")}</T>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.block}>
              <T style={styles.blockTitle}>Sources</T>
              {citedSources.map((s) => (
                <SourceRow key={s.id} s={s} />
              ))}
            </View>
          </Disclosure>
          )}

          <Pressable onPress={onOpenAudit} accessibilityRole="button" style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.disclosureHead, styles.disclosure, (pressed || hovered) && { backgroundColor: color.hover }]}>
            <View style={styles.flex}>
              <T v="heading">How this card was built</T>
              <T v="small">
                {card.claims.length} {card.claims.length === 1 ? "quote" : "quotes"} proposed · {accepted} kept · {rejected} rejected
              </T>
            </View>
            <ArrowUpRight size={20} color={color.ink} strokeWidth={2} />
          </Pressable>
        </View>

        <T v="meta" style={styles.disclaimer}>
          {DISCLAIMER}
        </T>
      </ScrollView>
    </View>
  );
}

const WARNING_WORDS: Partial<Record<SignalLevel, RegExp>> = {
  serious_warning: /(death|fatal|life-threatening|contraindicated)/gi,
  label_advises_against: /(avoid|not recommended|do not|should not|discontinue)/gi,
};

/**
 * Long label passages (tables, lists) are cut to the sentence that carries the warning words or names the pair.
 * The cut is marked with ellipses and the full passage is one tap away.
 */
function excerpt(quote: string, level: SignalLevel, names: string[]): string {
  const words = quote.split(/\s+/);
  if (words.length <= 45) return quote;
  const rx = WARNING_WORDS[level];
  const sentences = quote.split(/(?<=[.;:])\s+/);
  const score = (t: string) => (rx && new RegExp(rx.source, "i").test(t) ? 2 : 0) + names.filter((n) => t.toLowerCase().includes(n.toLowerCase())).length;
  let best = sentences.reduce((x, y) => (score(y) > score(x) ? y : x), sentences[0]);
  const bw = best.split(/\s+/);
  if (bw.length > 45) best = bw.slice(0, 40).join(" ") + "…";
  const at = quote.indexOf(best.replace(/…$/, ""));
  return `${at > 0 ? "…" : ""}${best}${at + best.length < quote.length && !best.endsWith("…") ? " …" : ""}`;
}

/** The basis quote, with the words that set the level in bold. Same word lists as signalOf. */
function Highlighted({ text, level, inline = false }: { text: string; level: SignalLevel; inline?: boolean }) {
  const rx = WARNING_WORDS[level];
  const parts = rx ? text.split(rx) : [text];
  const body = parts.map((p, i) =>
    i % 2 === 1 ? (
      <T key={i} style={{ fontFamily: font.bold, color: color.ink }}>
        {p}
      </T>
    ) : (
      p
    ),
  );
  if (inline) return <>{body}</>;
  return (
    <T style={styles.basisText} selectable>
      “{body}”
    </T>
  );
}

function Spec({ label, value, note, form, hue, grow }: { label: string; value: string; note?: string; form?: LineForm; hue?: string; grow: boolean }) {
  return (
    <View style={[styles.spec, grow && { flex: 1 }]}>
      <T v="tag" style={{ color: color.inkSoft }}>
        {label.toUpperCase()}
      </T>
      <View style={styles.specValue}>
        {form && hue ? <LineFormSample form={form} hue={hue} width={24} /> : null}
        <T v="heading" style={{ flexShrink: 1 }}>
          {value}
        </T>
      </View>
      {note ? <T v="meta">{note}</T> : null}
    </View>
  );
}

/** One-line expandable row: 16/700 label, 14px summary, +/− marker, >=48px tall, hairline divider. */
function Disclosure({ title, summary, initiallyOpen = false, bare = false, children }: { title: string; summary: string; initiallyOpen?: boolean; bare?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={bare ? undefined : styles.disclosure}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.disclosureHead, (pressed || hovered) && { backgroundColor: color.hover }]}
      >
        <View style={styles.flex}>
          <T v="heading">{title}</T>
          {!open && <T v="small">{summary}</T>}
        </View>
        {open ? <Minus size={20} color={color.ink} strokeWidth={2.25} /> : <Plus size={20} color={color.ink} strokeWidth={2.25} />}
      </Pressable>
      {open && <View style={styles.disclosureBody}>{children}</View>}
    </View>
  );
}

type Ctx = {
  claims: Map<string, Claim>;
  sources: Map<string, Source>;
  keyOf: Map<string, number>;
  open: Set<string>;
  toggle: (id: string) => void;
};

function SentenceView({ s, ctx, lead = false }: { s: Sentence; ctx: Ctx; lead?: boolean }) {
  const ids = s.claimIds.filter((id) => ctx.keyOf.has(id));
  return (
    <View style={styles.sentence}>
      <T v={lead ? "lead" : "body"}>
        {clean(s.text)}
        {ids.map((id) => {
          const n = ctx.keyOf.get(id)!;
          const on = ctx.open.has(id);
          return (
            <T key={id} v="tag">
              {" "}
              <T
                v="tag"
                onPress={() => ctx.toggle(id)}
                accessibilityRole="button"
                accessibilityLabel={`${on ? "Hide" : "Show"} quote ${n}`}
                style={[styles.key, on && styles.keyOn]}
              >
                {` ${n} `}
              </T>
            </T>
          );
        })}
      </T>
      {ids.filter((id) => ctx.open.has(id)).map((id) => (
        <QuoteBlock key={id} n={ctx.keyOf.get(id)!} claim={ctx.claims.get(id)!} source={ctx.sources.get(ctx.claims.get(id)!.source.id)} />
      ))}
    </View>
  );
}

export function QuoteBlock({ n, claim, source }: { n?: number; claim: Claim; source?: Source }) {
  return (
    <View style={styles.quote}>
      <T v="body" style={styles.quoteText} selectable>
        {n ? `${n}  ` : ""}“{claim.quote}”
      </T>
      <View style={styles.quoteMeta}>
        {source && (
          <Pressable onPress={() => Linking.openURL(source.url)} accessibilityRole="link" style={styles.linkRow}>
            <T v="small" style={styles.link}>
              {prettyCitation(source)}
            </T>
            <ArrowUpRight size={14} color={color.ink} strokeWidth={2} />
          </Pressable>
        )}
        <T v="meta">
          {claim.quoteCheck === "matched" ? "Quote matched" : "Quote not found"}
          {claim.support ? ` · Support checked: ${claim.support.replace(/_/g, " ")}` : ""}
        </T>
      </View>
    </View>
  );
}

/** Defensive: claim ids belong in claimIds, never in prose. */
const clean = (t: string) => t.replace(/\s*(\[c\d+\])+/g, "").trim();

function Half({ title, ids, ctx }: { title: string; ids: string[]; ctx: Ctx }) {
  return (
    <View style={styles.half}>
      <T v="heading">{title}</T>
      {ids.map((id) => {
        const c = ctx.claims.get(id);
        if (!c) return null;
        const src = ctx.sources.get(c.source.id);
        return (
          <View key={id} style={{ gap: space[1] }}>
            <T v="heading">{src ? prettyCitation(src) : c.source.id}</T>
            {src?.sampleSize ? <T v="small">{[`${src.sampleSize} participants`, src.population].filter(Boolean).join(" · ")}</T> : null}
            <T v="body" style={{ fontSize: size.sm, lineHeight: 20 }}>
              {c.text}
            </T>
          </View>
        );
      })}
    </View>
  );
}

function SourceRow({ s }: { s: Source }) {
  const facts = [s.sampleSize ? `${s.sampleSize} participants` : null, s.population].filter(Boolean) as string[];
  return (
    <View style={styles.source}>
      <View style={styles.badge}>
        <T v="tag">{designLabel[s.design].toUpperCase()}</T>
      </View>
      <Pressable onPress={() => Linking.openURL(s.url)} accessibilityRole="link" style={styles.linkRow}>
        <T v="heading" style={styles.link}>
          {prettyCitation(s)}
        </T>
        <ArrowUpRight size={16} color={color.ink} strokeWidth={2} />
      </Pressable>
      <T v="small">{s.title}</T>
      {facts.length > 0 && <T v="small" style={{ color: color.ink }}>{facts.join(" · ")}</T>}
      {s.limitations?.length ? <T v="meta">Limits: {s.limitations.join(" · ")}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: color.paper },
  panelBar: { flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[5], paddingVertical: space[1], borderBottomWidth: 1, borderBottomColor: color.ruleFaint },
  panelTitle: { fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3 },
  close: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space[5], paddingTop: space[4], paddingBottom: space[7], gap: space[5] },
  pageBody: { paddingTop: space[5], gap: space[6] },
  pageCol: { width: "100%", maxWidth: 760, alignSelf: "center" },
  backRow: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 36, alignSelf: "flex-start", marginBottom: -space[3] },
  field: { flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[5], paddingVertical: space[4] },
  fieldText: { fontFamily: font.bold, fontSize: size.xl, lineHeight: 32, letterSpacing: -0.6 },
  fieldTextPanel: { fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3 },
  basis: { gap: space[2] },
  basisQuote: { borderLeftWidth: 4, paddingLeft: space[4], paddingVertical: space[1], gap: space[3] },
  basisText: { fontFamily: font.regular, fontSize: size.md, lineHeight: 26, color: color.inkSoft },
  textBtn: { color: color.ink, textDecorationLine: "underline", alignSelf: "flex-start" },
  rule1: { height: 1, backgroundColor: color.ruleFaint },
  specs: { flexDirection: "row", borderTopWidth: 2, borderTopColor: color.rule, borderBottomWidth: 1, borderBottomColor: color.ruleFaint },
  specsNarrow: { flexDirection: "column", gap: 0 },
  spec: { gap: 4, paddingVertical: space[3], paddingRight: space[4], minWidth: 160 },
  specValue: { flexDirection: "row", alignItems: "center", gap: space[2] },
  block: { gap: space[3] },
  blockTitle: { fontFamily: font.bold, fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3, color: color.ink },
  festHead: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  conflictBox: { flexDirection: "row", alignItems: "center", gap: space[3], borderWidth: 2, borderColor: color.ink, padding: space[3] },
  questions: { paddingTop: space[5], borderTopWidth: 2, borderTopColor: color.rule },
  qNum: { width: 22, height: 22, lineHeight: 22, textAlign: "center", backgroundColor: color.ink, color: color.paper, marginTop: 1 },
  rows: { borderTopWidth: 1, borderTopColor: color.ruleFaint },
  disclosure: { borderBottomWidth: 1, borderBottomColor: color.ruleFaint },
  disclosureHead: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 56, paddingVertical: space[2], paddingHorizontal: space[2], marginHorizontal: -space[2] },
  disclosureBody: { gap: space[3], paddingBottom: space[4] },
  sentence: { gap: space[2] },
  key: { backgroundColor: color.ink, color: color.paper, fontSize: 11 },
  keyOn: { backgroundColor: color.focus },
  quote: { backgroundColor: color.paperDeep, padding: space[3], gap: space[2] },
  quoteText: { fontSize: size.sm, lineHeight: 21, color: color.ink },
  quoteMeta: { gap: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  link: { textDecorationLine: "underline", textDecorationColor: color.ruleFaint },
  halves: { flexDirection: "row", alignItems: "stretch" },
  half: { flex: 1, gap: space[2], paddingVertical: space[1] },
  doubleRule: { flexDirection: "row", gap: 3, marginHorizontal: space[3] },
  rule: { width: 2, backgroundColor: color.ink },
  source: { gap: 4, paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.ruleFaint },
  badge: { alignSelf: "flex-start", borderWidth: 1.5, borderColor: color.ink, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 2 },
  gap: { gap: 4 },
  bulletRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  flex: { flex: 1 },
  disclaimer: { marginTop: space[2] },
});
