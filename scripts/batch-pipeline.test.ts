import { describe, it, expect } from "vitest";
import { drinkingAlcohol, validReason } from "./batch-filter";
import { htmlText, frenchSections } from "./eu-smpc";
import { quoteMatches } from "../server/agent/verify";
import { buildCard } from "./build-batch-cards";
import { packetSchema } from "./batch-packets";
import { claimsSchema, verdictSchema, validate } from "./validate-batch";
const packet = packetSchema.parse({
  pair: "a__b",
  a: "a",
  b: "b",
  identities: [],
  sources: [
    {
      ref: { kind: "fda_label", id: "label#boxed_warning" },
      title: "Label",
      url: "https://example.org",
      citation: "FDA",
      language: "en",
      design: "regulatory_label",
      text: "Combining A and B increases bleeding risk.",
    },
  ],
  prescan: [],
});
const draft = claimsSchema.parse({
  pair: "a__b",
  curator: "fixture",
  claims: [
    {
      id: "c1",
      text: "The label reports increased bleeding risk with A and B.",
      quote: packet.sources[0].text,
      sourceId: "label#boxed_warning",
      stance: "increases_risk",
      outcome: "bleeding",
    },
  ],
  headline: {
    text: "The label reports increased bleeding risk.",
    claimIds: ["c1"],
  },
  reported: [
    {
      text: "The combination increases bleeding risk according to the label.",
      claimIds: ["c1"],
    },
  ],
  mechanism: [],
  category: "bleeding",
  gaps: [],
});
const verdict = verdictSchema.parse({
  pair: "a__b",
  judge: "fixture",
  claims: [{ id: "c1", support: "supports", rationale: "Explicit warning." }],
  sentences: [
    { path: "headline", support: "supports" },
    { path: "reported.0", support: "supports" },
  ],
});
describe("offline batch pipeline", () => {
  it.each([
    "benzyl alcohol may irritate skin",
    "alcohol-based gel",
    "contains alcohol as an ingredient",
    "alcohol swab",
    "products with high concentrations of alcohol have a drying effect",
    "PROSTIN contains ethanol. Ethanol may cause CNS depressant effects.",
    "Increased mortality in patients with moderate to severe alcoholic hepatitis.",
    "Increased risk of non-alcoholic fatty liver disease.",
  ])("rejects formulation %s", (s) => expect(drinkingAlcohol(s)).toBe(false));
  it.each([
    "Avoid drinking alcohol.",
    "Alcohol consumption increases sedation.",
    "Pregabalin was co-administered with oxycodone, lorazepam, or ethanol.",
    "CNS depressant effects may be additive to those of alcohol.",
  ])("keeps drinking interaction %s", (s) =>
    expect(drinkingAlcohol(s)).toBe(true),
  );
  it("rejects broad classes", () =>
    expect(
      validReason(
        {
          kind: "class",
          owner: "a",
          target: "b",
          section: "drug_interactions",
          term: "Enzyme Inhibitors",
        },
        "Enzyme inhibitors increase exposure.",
      ),
    ).toBe(false));
  it("reuses server normalization", () => {
    expect(quoteMatches("A “quote” — here", 'A "quote" -\n here')).toBe(true);
    expect(quoteMatches("", "abc")).toBe(false);
  });
  it("builds a real card using shared derivations", () => {
    const c = buildCard(packet, draft, verdict, "2026-11-04");
    expect(c?.origin).toBe("batch");
    expect(c?.depth).toBe("label_only");
    expect(c?.signal?.level).toBe("serious_warning");
    expect(c?.claims[0].accepted).toBe(true);
  });
  it("rejects partial and missing quotes", () => {
    expect(
      buildCard(
        packet,
        draft,
        { ...verdict, claims: [{ ...verdict.claims[0], support: "partial" }] },
        "now",
      ),
    ).toBeNull();
    expect(
      buildCard(
        packet,
        { ...draft, claims: [{ ...draft.claims[0], quote: "Invented text" }] },
        verdict,
        "now",
      ),
    ).toBeNull();
  });
  it("drops rejected sentence", () =>
    expect(
      buildCard(
        packet,
        draft,
        {
          ...verdict,
          sentences: [
            verdict.sentences[0],
            { path: "reported.0", support: "does_not_support" },
          ],
        },
        "now",
      )?.reported,
    ).toEqual([]));
  it("fails closed on unsupported headline", () =>
    expect(() =>
      buildCard(
        packet,
        draft,
        {
          ...verdict,
          sentences: [
            { path: "headline", support: "does_not_support" },
            verdict.sentences[1],
          ],
        },
        "now",
      ),
    ).toThrow("headline"));
  it("requires translation for EU quotes", () =>
    expect(
      validate(draft, verdict, {
        ...packet,
        sources: [{ ...packet.sources[0], language: "es" }],
      }),
    ).toContain("Missing quoteEnglish c1"));
  it("strips HTML and selects RCP body", () => {
    expect(htmlText("<p>Exact <b>words</b>.</p>")).toBe("Exact words.");
    expect(
      frenchSections(
        '<p class="AmmAnnexeTitre2"><a name="RcpInteractionsMed">4.5. Interactions</a></p><p>' +
          "Contenu. ".repeat(20) +
          '</p><p class="AmmAnnexeTitre2">4.6. Grossesse</p>',
      )[0].text,
    ).not.toContain("4.6.");
  });
});
