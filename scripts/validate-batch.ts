import { edges } from "../data/edges";
import { readdirSync, existsSync } from "node:fs";
import { hasBannedWords } from "../server/agent/advice";
import { z } from "zod";
import { main, read, pairs, label, pairSchema } from "./batch-io";
import { packetSchema, type Packet } from "./batch-packets";
import { filterCandidates, validReason } from "./batch-filter";
export const sentenceSchema = z.object({
  text: z.string().min(1),
  claimIds: z.array(z.string()).min(1),
});
export const claimsSchema = z.object({
  pair: z.templateLiteral([z.string(), "__", z.string()]),
  curator: z.string().min(1),
  claims: z.array(
    z.object({
      id: z.string().min(1),
      text: z.string().min(1),
      quote: z.string().min(1),
      quoteEnglish: z.string().min(1).optional(),
      sourceId: z.string(),
      stance: z.enum([
        "increases_risk",
        "no_effect_observed",
        "mechanism",
        "uncertain",
      ]),
      outcome: z.string().min(1),
    }),
  ),
  // A zero-claim draft records an unsuccessful search; its headline then cites nothing.
  headline: z.object({ text: z.string().min(1), claimIds: z.array(z.string()) }),
  reported: z.array(sentenceSchema),
  mechanism: z.array(sentenceSchema),
  category: z.enum([
    "cns_depression",
    "bleeding",
    "liver",
    "serotonin",
    "reaction",
    "efficacy",
    "other",
  ]),
  gaps: z.array(
    z.object({ text: z.string().min(1), searched: z.array(z.string()) }),
  ),
});
export const verdictSchema = z.object({
  pair: z.templateLiteral([z.string(), "__", z.string()]),
  judge: z.string().min(1),
  claims: z.array(
    z.object({
      id: z.string(),
      support: z.enum([
        "supports",
        "partial",
        "does_not_support",
        "contradicts",
        "overstated",
      ]),
      rationale: z.string().min(1),
    }),
  ),
  sentences: z.array(
    z
      .object({
        path: z.string().optional(),
        index: z.union([z.string(), z.number()]).optional(),
        support: z.enum(["supports", "does_not_support"]),
      })
      .refine(
        (s) => s.path !== undefined || s.index !== undefined,
        "Sentence path or index required",
      ),
  ),
});
export type Draft = z.infer<typeof claimsSchema>;
export const headlineCites = (d: Draft) => d.claims.length === 0 || d.headline.claimIds.length > 0;
export type Verdict = z.infer<typeof verdictSchema>;
export const banned =
  /\b(?:safe|safely|should|recommend\w*|verified|ok\s+to|wait\s+\d+\s*(?:hours?|hrs?|minutes?|days?))\b/i;
export const words = (s: string) =>
  s.trim().split(/\s+/).filter(Boolean).length;
export function validate(d: Draft, v: Verdict, p: Packet) {
  const errors: string[] = [];
  if (d.pair !== p.pair || v.pair !== p.pair) errors.push("Pair mismatch");
  const ids = new Set(d.claims.map((c) => c.id));
  if (ids.size !== d.claims.length) errors.push("Duplicate claim IDs");
  if (!headlineCites(d)) errors.push("Headline cites no claim");
  const paths = [
    "headline",
    ...d.reported.map((_, i) => `reported.${i}`),
    ...d.mechanism.map((_, i) => `mechanism.${i}`),
  ];
  if (new Set(v.claims.map((c) => c.id)).size !== v.claims.length)
    errors.push("Duplicate claim verdicts");
  if (
    v.claims.some((c) => !ids.has(c.id)) ||
    d.claims.some((c) => !v.claims.some((j) => j.id === c.id))
  )
    errors.push("Claim verdict coverage");
  const sentencePaths = v.sentences.map(
    (s) => s.path ?? (typeof s.index === "number" ? paths[s.index] : s.index),
  );
  if (
    new Set(sentencePaths).size !== sentencePaths.length ||
    sentencePaths.some((s) => !s || !paths.includes(s))
  )
    errors.push("Invalid/duplicate sentence verdict path");
  if (paths.some((s) => !sentencePaths.includes(s)))
    errors.push("Sentence verdict coverage");
  for (const c of d.claims) {
    const source = p.sources.find((s) => s.ref.id === c.sourceId);
    if (!source) errors.push(`Unknown source ${c.sourceId}`);
    if (source?.language && source.language !== "en" && !c.quoteEnglish)
      errors.push(`Missing quoteEnglish ${c.id}`);
    if (banned.test(c.text) || hasBannedWords(c.text) || words(c.text) > 40)
      errors.push(`Claim prose ${c.id}`);
  }
  for (const [i, s] of [d.headline, ...d.reported, ...d.mechanism].entries()) {
    if (
      banned.test(s.text) ||
      hasBannedWords(s.text) ||
      words(s.text) > (i === 0 ? 25 : 40)
    )
      errors.push(`Sentence prose ${i}`);
    if (s.claimIds.some((id) => !ids.has(id)))
      errors.push(`Unknown claim in sentence ${i}`);
  }
  for (const gap of d.gaps)
    if (
      banned.test(gap.text) ||
      hasBannedWords(gap.text) ||
      words(gap.text) > 40
    )
      errors.push("Gap prose");
  return errors;
}
export function validateFiles() {
  let count = 0;
  const errors: string[] = [];
  const final = pairs();
  // Once shipping starts, validate the saved selection rather than selecting a new batch.
  const shipping = final.some(p => existsSync(`data/batch/evidence/${p.pair}.json`));
  if (!shipping && JSON.stringify(final) !== JSON.stringify(z.array(pairSchema).parse(filterCandidates().selected))) errors.push('Final selection does not match complete label selection');
  const reviewed = new Set(edges.map(e => e.pair));
  if (new Set(final.map(p => p.pair)).size !== final.length) errors.push('Duplicate final pair');
  for (const p of final) {
    if (reviewed.has(p.pair)) errors.push(`Already curated: ${p.pair}`);
    for (const r of p.reasons) if (!label(r.owner).sections.some(s => s.section === r.section && validReason(r, s.text))) errors.push(`Missing label reason: ${p.pair}`);
  }
  for (const p of [...final, ...edges]) {
    try {
      const packet = packetSchema.parse(read(`data/batch/packets/${p.pair}.json`));
      if (packet.pair !== p.pair || packet.a !== p.a || packet.b !== p.b) errors.push(`Packet identity: ${p.pair}`);
      if (!reviewed.has(p.pair) && !packet.sources.length) errors.push(`Empty packet: ${p.pair}`);
      if (reviewed.has(p.pair) && packet.sources.some(s => s.ref.kind !== 'eu_smpc')) errors.push(`Reviewed packet not EU-only: ${p.pair}`);
    } catch (e) { errors.push(`${p.pair}: ${String(e)}`); }
  }
  const assigned = Array.from({ length: 5 }, (_, i) => z.array(z.object({ pair: z.string() })).parse(read(`data/batch/slices/slice-${i}.json`)));
  const keys = assigned.flat().map(p => p.pair);
  if (Math.max(...assigned.map(s => s.length)) - Math.min(...assigned.map(s => s.length)) > 1) errors.push('Unbalanced slices');
  if (keys.length !== final.length || new Set(keys).size !== final.length || final.some(p => !keys.includes(p.pair))) errors.push('Slice coverage');
  if (final.filter(p => p.a === 'alcohol' || p.b === 'alcohol').length >= 5 && assigned.some(s => !s[0]?.pair.split('__').includes('alcohol'))) errors.push('Slice must start with alcohol');
  const euReviewed = z.array(z.object({ pair: z.string() })).parse(read('data/batch/slices/eu-reviewed.json'));
  if (euReviewed.length !== reviewed.size || new Set(euReviewed.map(p => p.pair)).size !== reviewed.size || euReviewed.some(p => !reviewed.has(p.pair as `${string}__${string}`))) errors.push('Reviewed slice coverage');
  for (const f of existsSync("data/batch/claims")
    ? readdirSync("data/batch/claims").filter((f) => f.endsWith(".json"))
    : []) {
    try {
      const d = claimsSchema.parse(read("data/batch/claims/" + f));
      const v = verdictSchema.parse(read("data/batch/verdicts/" + f));
      const p = packetSchema.parse(read("data/batch/packets/" + f));
      errors.push(...validate(d, v, p).map((e) => `${f}: ${e}`));
      count++;
    } catch (e) {
      errors.push(`${f}: ${String(e)}`);
    }
  }
  if (errors.length) throw Error(errors.join("\n"));
  process.stdout.write(`Validated ${count} claim/verdict files\n`);
}
if (main("validate-batch.ts")) validateFiles();
