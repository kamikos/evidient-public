import type { EdgeCard, EvidenceSignal, SignalLevel, Substance } from "@/shared/contract";

/** What the label/regulator says, at a glance. Never a safety verdict. */
export const signalCopy: Record<SignalLevel, { label: string; short: string; bars: number }> = {
  serious_warning: { label: "Serious warning on the label", short: "Serious label warning", bars: 3 },
  label_advises_against: { label: "Label advises against combining", short: "Label advises against", bars: 2 },
  label_mentions: { label: "Label mentions an interaction", short: "Label mentions it", bars: 1 },
  label_no_interaction: { label: "Label says no significant interaction", short: "Label: not significant", bars: 0 },
  studies_only: { label: "Reported in studies only", short: "Studies only", bars: 0 },
};

export const NOTHING_DOCUMENTED = {
  label: "Nothing documented in our sources",
  detail: "Evidient found no interaction between these in the FDA labels and studies it covers. It covers only a small set of substances, and a gap here doesn't mean there's no risk.",
};

const serious = /\b(death|fatal|life-threatening|contraindicated)\b/i;
const against = /\b(avoid|not recommended|do not|should not|discontinue)\b/i;

/** Same deterministic rule as the server (server/agent/derive.ts); used when a card predates `signal`. */
export function signalOf(card: EdgeCard): EvidenceSignal {
  if (card.signal) return card.signal;
  const label = card.claims.filter((c) => c.accepted && (c.source.kind === "fda_label" || c.source.kind === "eu_smpc"));
  const pick = (test: (c: (typeof label)[number]) => boolean) => label.filter(test).map((c) => c.id);
  const conflict = card.conflicts.length > 0;
  const quote = (c: (typeof label)[number]) => {
    const language = card.sources.find(s => s.kind === c.source.kind && s.id === c.source.id)?.language;
    return language !== "en" ? c.quoteEnglish ?? c.quote : c.quote;
  };
  const s = pick((c) => /#(boxed_warning|contraindications)$/i.test(c.source.id) || /death|fatal|life-threatening|contraindicated/i.test(quote(c)));
  if (s.length) return { level: "serious_warning", basis: s, conflict };
  const a = pick((c) => /avoid|not recommended|do not|should not|discontinue/i.test(quote(c)));
  if (a.length) return { level: "label_advises_against", basis: a, conflict };
  if (label.length) return { level: "label_mentions", basis: label.map((c) => c.id), conflict };
  return { level: "studies_only", basis: card.claims.filter((c) => c.accepted).map((c) => c.id), conflict };
}

/**
 * The words in the basis quote that set the level, found with the same regexes as signalOf,
 * widened to a short phrase so "Why this level" fits on one line. Never model-chosen.
 */
export function levelPhrase(quote: string, level: EvidenceSignal["level"]): string {
  const rx = level === "serious_warning" ? serious : level === "label_advises_against" ? against : null;
  const words = quote.replace(/\s+/g, " ").trim().split(" ");
  if (rx) {
    const i = words.findIndex((w, k) => rx.test(words.slice(k, k + 2).join(" ")));
    if (i >= 0) {
      const start = Math.max(0, i - 2);
      const end = Math.min(words.length, i + 5);
      return `${start > 0 ? "…" : ""}${words.slice(start, end).join(" ")}${end < words.length ? "…" : ""}`;
    }
  }
  return words.length > 12 ? `${words.slice(0, 12).join(" ")}…` : words.join(" ");
}

/** True when quote-matched claims were rejected only because the independent judge could not run. */
export function checkDidNotFinish(card: EdgeCard) {
  return !card.claims.some((c) => c.accepted) && card.claims.some((c) => c.quoteCheck === "matched" && c.judgeRationale === "Judge unavailable");
}

export const levelRank = (l?: SignalLevel) => (l ? signalCopy[l].bars + 1 : 0);

/** "Tylenol (acetaminophen)" when a brand exists, else the generic name. */
export function displayName(s: Substance, mode: "brand-first" | "generic" = "brand-first") {
  const brand = s.brands?.[0];
  if (!brand || mode === "generic") return s.name;
  return `${brand} (${s.name.toLowerCase()})`;
}

const SECTION_NAMES: Record<string, string> = {
  boxed_warning: "Boxed Warning",
  warnings_and_cautions: "Warnings and Precautions",
  warnings_and_precautions: "Warnings and Precautions",
  warnings: "Warnings",
  precautions: "Precautions",
  drug_interactions: "Drug Interactions",
  contraindications: "Contraindications",
  do_not_use: "Do Not Use",
  ask_doctor_or_pharmacist: "Ask a Doctor or Pharmacist",
  stop_use: "Stop Use",
  when_using: "When Using",
};
const COUNTRY_NAMES: Record<string, string> = { ES: "Spanish", FR: "French", IT: "Italian", DE: "German", NO: "Norwegian", PL: "Polish" };

/** "boxed_warning" -> "Boxed Warning"; unknown keys get spaces and an initial capital. */
export const sectionName = (key: string) => SECTION_NAMES[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Readable source line. Batch packets carry raw registry citations ("FDA label · boxed_warning",
 * "1538-2443 18 5 2012 Oct Journal of neurovirology J Neurovirol"); curated ones are already readable.
 */
export function prettyCitation(s: { kind: string; id: string; citation: string; country?: string; year?: number }): string {
  if (s.kind === "fda_label") {
    const section = s.id.split("#")[1] ?? s.citation.split("·")[1]?.trim();
    return section ? `FDA label · ${sectionName(section.trim())}` : "FDA label";
  }
  if (s.kind === "eu_smpc") {
    const section = s.id.split("#")[1];
    const who = COUNTRY_NAMES[s.country ?? s.id.slice(0, 2)] ?? s.country ?? "EU";
    return `${who} product information${section ? ` · section ${section}` : ""}`;
  }
  const raw = s.citation.replace(/^Unknown author et al\. · /, "");
  const m = raw.match(/^[\dX]{4}-[\dX]{4}\s+(?:\S+\s+)*?((?:19|20)\d{2})\s+(?:[A-Z][a-z]{2}\s+)?(.+)$/);
  // Journal subtitles ("Medical principles and practice : international journal of …") add nothing to a citation line.
  const short = (c: string) => c.replace(/\s+:\s+[^·]+?(?=\s+(?:19|20)\d{2}$)/, "");
  if (!m) return short(raw);
  const words = m[2].split(/\s+/);
  const k = words.findIndex((w, i) => i > 0 && w[0] === words[0][0].toUpperCase() && words.slice(i).every((x) => /^[A-Z]/.test(x)));
  return short(`${(k > 0 ? words.slice(k) : words).join(" ")} ${m[1]}`);
}
