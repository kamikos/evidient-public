import { z } from "zod";
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import type {
  Claim,
  EdgeCard,
  EvidenceRecord,
  Sentence,
} from "../shared/contract";
import { quoteMatches } from "../server/agent/verify";
import {
  deriveDepth,
  deriveConflicts,
  computeSignal,
} from "../server/agent/derive";
import { questions } from "../server/agent/questions";
import { main, read, save } from "./batch-io";
import { packetSchema, type Packet } from "./batch-packets";
import {
  claimsSchema,
  verdictSchema,
  validate,
  type Draft,
  type Verdict,
} from "./validate-batch";
/** Drafts sometimes cite inline, e.g. "(c1, c2)"; the card shows citations as quote keys instead. */
const stripInlineCites = (t: string) => t.replace(/\s*\((?:c\d+(?:,\s*|\s+and\s+)?)+\)/g, "").trim();
export function buildCard(
  p: Packet,
  d: Draft,
  v: Verdict,
  generatedAt: string,
): EdgeCard | null {
  const errors = validate(d, v, p);
  if (errors.length) throw Error(errors.join("; "));
  const claims: Claim[] = d.claims.map((c) => {
    const source = p.sources.find((s) => s.ref.id === c.sourceId);
    if (!source) throw Error("Unknown source");
    const verdict = v.claims.find((j) => j.id === c.id);
    const matched = quoteMatches(c.quote, source.text);
    return {
      id: c.id,
      text: c.text,
      quote: c.quote,
      ...(c.quoteEnglish ? { quoteEnglish: c.quoteEnglish } : {}),
      source: source.ref,
      stance: c.stance,
      outcome: c.outcome,
      quoteCheck: matched ? "matched" : "not_found",
      support: verdict?.support,
      judgeModel: v.judge,
      judgeRationale: verdict?.rationale,
      accepted: matched && verdict?.support === "supports",
    };
  });
  const accepted = new Set(claims.filter((c) => c.accepted).map((c) => c.id));
  if (!accepted.size) return null;
  const paths = [
    "headline",
    ...d.reported.map((_, i) => `reported.${i}`),
    ...d.mechanism.map((_, i) => `mechanism.${i}`),
  ];
  function sentence(s: Sentence, path: string): Sentence | null {
    const verdict = v.sentences.find(
      (j) =>
        (j.path ?? (typeof j.index === "number" ? paths[j.index] : j.index)) ===
        path,
    );
    return s.claimIds.length &&
      s.claimIds.every((id) => accepted.has(id)) &&
      verdict?.support === "supports"
      ? { ...s, text: stripInlineCites(s.text) }
      : null;
  }
  // If the judge rejected the drafted headline, promote the first judged-supported "reported" sentence that
  // names a drug in this pair and fits the headline length. No new text is written; otherwise the card is blocked.
  const drugNames = p.identities.filter((i) => i.id !== "alcohol").flatMap((i) => [i.name, ...i.brands]).map((n) => n.toLowerCase());
  const headline =
    sentence(d.headline, "headline") ??
    d.reported
      .map((s, i) => sentence(s, `reported.${i}`))
      .find((s) => s && s.text.trim().split(/\s+/).length <= 25 && drugNames.some((n) => s.text.toLowerCase().includes(n))) ??
    null;
  if (!headline)
    throw Error(`No supported headline for ${p.pair}; revise draft`);
  const sources = p.sources.map(({ ref, text, ...s }) => ({ ...ref, ...s }));
  const conflicts = deriveConflicts(claims).map((c) => {
    const summary = [
      headline,
      ...d.reported.map((s, i) => sentence(s, `reported.${i}`)),
      ...d.mechanism.map((s, i) => sentence(s, `mechanism.${i}`)),
    ].find(
      (s) =>
        s &&
        c.sideA.some((id) => s.claimIds.includes(id)) &&
        c.sideB.some((id) => s.claimIds.includes(id)),
    );
    // Without a judged sentence that cites both sides there is no neutral summary to show; the opposing
    // claims still appear under "What has been reported", so the conflict box is omitted rather than invented.
    return summary ? { ...c, summary } : null;
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  const depth = deriveDepth(claims, sources);
  return {
    pair: p.pair,
    a: p.a,
    b: p.b,
    origin: "batch",
    category: d.category,
    headline,
    reported: d.reported.flatMap((s, i) => {
      const kept = sentence(s, `reported.${i}`);
      return kept && kept.text !== headline.text ? [kept] : [];
    }),
    mechanism: d.mechanism.flatMap(
      (s, i) => sentence(s, `mechanism.${i}`) ?? [],
    ),
    claims,
    sources,
    conflicts,
    depth,
    signal: computeSignal({ claims, conflicts }),
    pharmacistQuestions: questions({ a: p.a, b: p.b, depth, conflicts }),
    gaps: d.gaps.map((g, i) => ({ id: `g${i + 1}`, ...g })),
    generatedAt,
    models: { research: d.curator, judge: v.judge, synth: d.curator },
  };
}
export function buildCards(onlyPairs: string[] = []) {
  const empty: string[] = [];
  const blocked: unknown[] = [];
  for (const f of existsSync("data/batch/claims")
    ? readdirSync("data/batch/claims").filter((f) => f.endsWith(".json"))
    : []) {
    if (onlyPairs.length && !onlyPairs.includes(f.replace(/\.json$/, ""))) continue;
    const out = "data/batch/evidence/" + f;
    let preserved: EvidenceRecord | undefined;
    if (existsSync(out)) {
      const existing: EvidenceRecord = JSON.parse(readFileSync(out, "utf8"));
      if (/muse/i.test(JSON.stringify(existing))) {
        const draft = claimsSchema.parse(read("data/batch/claims/" + f));
        if (!draft.claims.some(c => c.sourceId.startsWith("EU:") && !existing.card.claims.some(old => old.id === c.id))) continue;
        preserved = existing;
      }
    }
    if (!existsSync("data/batch/verdicts/" + f)) continue;
    try {
      const card = buildCard(
        packetSchema.parse(read("data/batch/packets/" + f)),
        claimsSchema.parse(read("data/batch/claims/" + f)),
        verdictSchema.parse(read("data/batch/verdicts/" + f)),
        new Date().toISOString(),
      );
      if (card && preserved) {
        const old = preserved.card;
        const additions = card.claims.filter(c => c.accepted && c.source.kind === "eu_smpc" && !old.claims.some(previous => previous.id === c.id));
        const ids = new Set(additions.map(c => c.id));
        old.claims.push(...additions);
        old.reported.push(...[card.headline, ...card.reported].filter(s => s.claimIds.every(id => ids.has(id))));
        old.sources.push(...card.sources.filter(s => additions.some(c => c.source.kind === s.kind && c.source.id === s.id) && !old.sources.some(previous => previous.kind === s.kind && previous.id === s.id)));
        old.origin = "batch";
        old.depth = deriveDepth(old.claims, old.sources);
        old.signal = computeSignal(old);
        old.pharmacistQuestions = questions(old);
        old.generatedAt = card.generatedAt;
        old.models.judge = [...new Set([old.models.judge, card.models.judge])].join(", ");
        save(out, preserved);
      }
      else if (card) save(out, { card, trace: [] } satisfies EvidenceRecord);
      else {
        empty.push(f.replace(".json", ""));
        if (existsSync(out)) unlinkSync(out);
      }
    } catch (e) {
      blocked.push({ pair: f, error: String(e) });
    }
  }
  const rows = readdirSync("data/batch/evidence")
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const r = read("data/batch/evidence/" + f);
      const { card } = z
        .object({
          card: z.object({
            pair: z.string(),
            a: z.string(),
            b: z.string(),
            signal: z
              .object({
                level: z.enum([
                  "serious_warning",
                  "label_advises_against",
                  "label_mentions",
                  "label_no_interaction",
                  "studies_only",
                ]),
                conflict: z.boolean(),
              })
              .optional(),
            category: claimsSchema.shape.category,
            headline: claimsSchema.shape.headline,
            depth: z.enum(["human_studies", "label_only", "limited"]),
            origin: z.enum(["batch", "curated", "requested"]).optional(),
          }),
        })
        .parse(r);
      return {
        pair: card.pair,
        a: card.a,
        b: card.b,
        level: card.signal?.level,
        conflict: card.signal?.conflict ?? false,
        category: card.category,
        headline: card.headline.text,
        depth: card.depth,
        origin: card.origin ?? "batch",
      };
    })
    .sort((a, b) => a.pair.localeCompare(b.pair));
  save("data/batch/index.json", rows);
  if (!onlyPairs.length) {
    save("data/batch/empty.json", empty);
    save("artifacts/M10b-build-blocked.json", blocked);
  }
  if (blocked.length) throw Error(JSON.stringify(blocked));
}
if (main("build-batch-cards.ts")) buildCards(process.argv.slice(2));
