// Shared contract between server (Codex-owned) and UI (Claude-owned).
// Changing a type here is a cross-team change: note it in the PR/summary.

export type SubstanceId = string; // kebab-case, e.g. "metronidazole", "alcohol"

export type SubstanceKind = "rx" | "otc" | "alcohol";

export interface Substance {
  id: SubstanceId;
  name: string; // display name, e.g. "Metronidazole"
  kind: SubstanceKind;
  rxcui?: string; // RxNorm concept id (absent for alcohol)
  aliases: string[]; // brand names + common spellings, lowercase
  drugClass: string; // short, e.g. "Antibiotic (nitroimidazole)"
  /** Display-cased brand names people see on the box, e.g. ["Adderall"], ["Tylenol"]. */
  brands?: string[];
}

/**
 * Name catalogue: ~1000 common active ingredients with US and EU brand names, built by a deterministic
 * script from public registries (RxNorm, Polish URPL open data) plus a hand-written overrides file.
 * No model is involved. Only entries with `substanceId` have reviewed evidence; the rest are "not reviewed yet".
 */
/** US, Canada, Norway, Poland, France, Italy, Spain, or EU-wide (centrally authorised). */
export type Market = "US" | "CA" | "NO" | "PL" | "FR" | "IT" | "ES" | "EU";

export interface CatalogEntry {
  /** kebab-case English INN, e.g. "methylphenidate"; equals Substance.id when reviewed */
  id: string;
  /** English INN display name, e.g. "Methylphenidate" */
  name: string;
  /** other generic spellings: "paracetamol", Latin/Polish forms, salts ("methylphenidate hydrochloride") */
  synonyms: string[];
  /** "supplement" entries come from the NIH Dietary Supplement Label Database, not drug registries */
  kind?: "medicine" | "supplement";
  /** brand names as printed on the box, with the markets (country codes, "EU" for EU-wide) they come from */
  brands: { name: string; markets: Market[] }[];
  /** curated Substance id when Evidient has reviewed evidence for it */
  substanceId?: SubstanceId;
  rxcui?: string;
  /** DailyMed search link for the official US label, deterministic from the name */
  labelUrl: string;
}

/**
 * At-a-glance level, derived DETERMINISTICALLY from accepted claims (never by a model).
 * It reports what the regulator's label says; it is never a safety verdict.
 *  - serious_warning: accepted label claim from boxed_warning/contraindications, or label quote with
 *    death | fatal | life-threatening | contraindicated
 *  - label_advises_against: accepted label claim whose quote says avoid | not recommended | do not | should not | discontinue
 *  - label_mentions: any other accepted label claim
 *  - label_no_interaction: every remaining label quote says the effect is not clinically significant
 *    ("no clinically significant interaction", "no interactions … are expected", "no dose adjustment")
 *    and none of them also says avoid, monitor or use caution
 *  - studies_only: accepted claims exist but none from a label
 */
export type SignalLevel = "serious_warning" | "label_advises_against" | "label_mentions" | "label_no_interaction" | "studies_only";

export interface EvidenceSignal {
  level: SignalLevel;
  /** accepted claim ids that set the level (the UI shows their quotes as the reason) */
  basis: string[];
  conflict: boolean;
}

export type HarmCategory =
  | "cns_depression"
  | "bleeding"
  | "liver"
  | "serotonin"
  | "reaction" // e.g. disulfiram-like
  | "efficacy" // one drug reduces the other's effect
  | "other";

/** How deep the human evidence goes for an edge, derived deterministically from accepted claims. */
export type EvidenceDepth =
  | "human_studies" // >=1 accepted claim from a controlled or observational human study
  | "label_only" // only regulatory label claims
  | "limited"; // case reports / mechanism / animal only

export type PairKey = `${SubstanceId}__${SubstanceId}`; // ids sorted alphabetically

export interface CuratedEdge {
  pair: PairKey;
  a: SubstanceId;
  b: SubstanceId;
  category: HarmCategory;
  /** One-line, human-written label for the graph, e.g. "Liver injury risk reported". No advice. */
  label: string;
  seedSources: SourceRef[];
}

/** eu_smpc: official EU product information (summary of product characteristics), e.g. Spain CIMA or France BDPM. */
export type SourceKind = "fda_label" | "pubmed" | "eu_smpc";

export interface SourceRef {
  kind: SourceKind;
  /** fda_label: `${set_id}#${section}` ; pubmed: PMID ; eu_smpc: `${country}:${registry id}#${section}` e.g. "ES:12345#4.5" */
  id: string;
}

export type StudyDesign =
  | "regulatory_label"
  | "rct"
  | "controlled_trial"
  | "cohort"
  | "case_control"
  | "case_series"
  | "case_report"
  | "review"
  | "mechanistic"
  | "animal"
  | "other";

export interface Source extends SourceRef {
  title: string;
  url: string;
  /** e.g. "FDA label · Drug Interactions" or "Ann Pharmacother 2002" */
  citation: string;
  year?: number;
  design: StudyDesign;
  /** eu_smpc only: issuing jurisdiction (ISO 3166 alpha-2, or EU for EMA) and the language the quoted text is in (ISO 639-1). */
  country?: string;
  language?: string;
  /** Only for studies, when stated in the abstract. */
  sampleSize?: number;
  population?: string; // e.g. "12 healthy male volunteers"
  limitations?: string[]; // quote-backed or stated by the source
}

export type ClaimStance = "increases_risk" | "no_effect_observed" | "mechanism" | "uncertain";

export type QuoteCheck = "matched" | "not_found";
export type SupportVerdict = "supports" | "partial" | "does_not_support" | "contradicts" | "overstated";

export interface Claim {
  id: string; // "c1", "c2", ...
  text: string; // plain-language claim, no advice
  quote: string; // verbatim span from source text, in the source's own language
  /** English rendering of a non-English quote, written by the curating agent; the quote check uses `quote`. */
  quoteEnglish?: string;
  source: SourceRef;
  stance: ClaimStance;
  outcome: string; // normalized outcome key used for conflict detection, e.g. "disulfiram_like_reaction"
  quoteCheck: QuoteCheck;
  support?: SupportVerdict; // absent if quoteCheck failed (judge not run)
  judgeModel?: string;
  judgeRationale?: string; // one sentence
  accepted: boolean; // quoteCheck === "matched" && support in {supports, partial}
  injected?: boolean; // adversarial demo claim
}

export interface Gap {
  id: string;
  /** What the agent looked for and did not find, e.g. "No controlled human study of this combination found in PubMed." */
  text: string;
  searched: string[]; // queries tried
}

export interface Conflict {
  outcome: string;
  /** claim ids on each side */
  sideA: string[]; // increases_risk
  sideB: string[]; // no_effect_observed
  /** Neutral, quote-free framing written by synthesizer, must cite claims via sentence.claimIds */
  summary: Sentence;
}

/** Every rendered sentence must cite >=1 accepted claim. Server drops sentences with none. */
export interface Sentence {
  text: string;
  claimIds: string[];
}

export type PharmacistQuestionTrigger = "conflict" | "label_only" | "no_human_data" | "mechanism_unknown" | "always";

export interface EdgeCard {
  pair: PairKey;
  a: SubstanceId;
  b: SubstanceId;
  category: HarmCategory;
  depth: EvidenceDepth;
  /** Optional for backward compatibility; all cards after M6 carry it. */
  signal?: EvidenceSignal;
  /**
   * "curated": a pair on the human-reviewed list. "requested": researched live by the agent because a user asked;
   * same quote check and judge, but not yet checked by a person. "batch": prepared offline from label/SmPC/PubMed
   * packets by coding agents (Codex/Claude), with the same deterministic quote check and an independent model as
   * judge; not yet checked by a person. Absent = curated.
   */
  origin?: "curated" | "requested" | "batch";
  headline: Sentence;
  reported: Sentence[]; // "What's been reported"
  mechanism: Sentence[]; // empty => UI shows "Mechanism not established in sources"
  conflicts: Conflict[];
  gaps: Gap[];
  /** Selected deterministically from a fixed template set (server/agent/questions.ts). */
  pharmacistQuestions: { trigger: PharmacistQuestionTrigger; text: string }[];
  claims: Claim[]; // all claims incl. rejected, for audit trail
  sources: Source[];
  generatedAt: string; // ISO
  models: { research: string; judge: string; synth: string };
}

// ---- Live agent trace (SSE `data:` payloads, one JSON object per event) ----

export type TraceEvent =
  | { type: "run_started"; pair: PairKey; at: string; models: EdgeCard["models"] }
  | { type: "thinking"; text: string } // short status line, not raw chain-of-thought
  | { type: "tool_call"; callId: string; name: string; args: Record<string, unknown>; parallelGroup?: number }
  | { type: "tool_result"; callId: string; summary: string; sourceIds?: string[] }
  | { type: "claim_proposed"; claim: Pick<Claim, "id" | "text" | "quote" | "source" | "stance" | "outcome" | "injected"> }
  | { type: "gap_recorded"; gap: Gap }
  | { type: "quote_checked"; claimId: string; result: QuoteCheck }
  | { type: "claim_judged"; claimId: string; support: SupportVerdict; rationale: string; model: string }
  | { type: "card_ready"; card: EdgeCard }
  /**
   * The hosting platform allows ~10 outbound requests per incoming request, so long runs are split into phases.
   * The stream ends after this event; the client POSTs `{ state }` to `next` and keeps reading events from that
   * response. `state` is opaque and HMAC-signed by the server (tampering is rejected).
   */
  | { type: "checkpoint"; next: string; state: string }
  | { type: "error"; message: string; recoverable: boolean };

/** Precomputed file shape: data/evidence/<pair>.json */
export interface EvidenceRecord {
  card: EdgeCard;
  trace: (TraceEvent & { t: number })[]; // t = ms since run start, for replay
}

/** One row of the shipped batch index (data/batch/index.json), enough to list a pair without loading its card. */
export interface BatchIndexRow {
  pair: PairKey;
  a: SubstanceId;
  b: SubstanceId;
  level: SignalLevel;
  conflict: boolean;
  category: HarmCategory;
  headline: string;
  depth: EvidenceDepth;
  origin: "requested" | "batch";
}

/**
 * Norway's national interaction database (DMP, FEST, NLOD): one record as shipped in the app.
 * The regulator's management ("håndtering") text is advice and is never extracted or shipped.
 * English fields are renderings written by a coding agent (Codex), shown beside the Norwegian original.
 */
export interface FestRecord {
  /** FEST Interaksjon id */
  id: string;
  /** FEST relevance code: "1" Bør unngås, "2" Forholdsregler bør tas, "3" Ingen tiltak nødvendig */
  relevance: "1" | "2" | "3";
  relevanceLabel: string;
  consequence: string;
  consequenceEnglish?: string;
  mechanism: string;
  mechanismEnglish?: string;
  situation?: string;
  situationEnglish?: string;
  basis: string;
  basisEnglish?: string;
  /** The two sides as FEST names them (a side can be a group, e.g. "Ritonavir" covering combination products). */
  sides: [string, string];
  references: { text: string; url?: string }[];
  /** FEST record timestamp (ISO) */
  updated: string;
}

/** Static file /fest/<catalogue id>.json: every FEST pair that includes this substance. */
export interface FestDrugFile {
  id: string;
  /** FEST HentetDato of the snapshot */
  retrieved: string;
  rows: { other: string; pair: PairKey; records: FestRecord[] }[];
}

// ---- API ----
// GET  /api/batch-index             -> { rows: BatchIndexRow[] }  (all shipped agent-built cards)
// GET  /api/evidence/<pair>         -> also serves batch cards (origin "batch"/"requested") when the pair isn't curated
// GET  /api/substances?q=           -> { results: Substance[] }
// GET  /api/graph?ids=a,b,c         -> { substances: Substance[]; edges: (CuratedEdge & { depth: EvidenceDepth | null })[] }
// GET  /api/evidence/<pair>         -> EvidenceRecord (precomputed)
// GET  /api/evidence/<pair>?live=1[&inject=1] -> text/event-stream of TraceEvent
// GET  /api/request?a=<catalogue or substance id>&b=<id> -> text/event-stream of TraceEvent; card_ready carries
//      an EdgeCard with origin "requested" (zero accepted claims = the agent found nothing in what it checked)
// POST /api/identify  { imageBase64, mimeType } -> { candidates: { substanceId: SubstanceId | null; readText: string; confidence: "high" | "medium" | "low" }[] }
