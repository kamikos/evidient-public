import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { edges } from "../data/edges";
import { substances } from "../data/substances";
import { publicationDesign } from "../server/agent/derive";
import {
  cached,
  catalog,
  compact,
  label,
  main,
  mentions,
  pairs,
  read,
  save,
  sentences,
} from "./batch-io";
import { euSchema, spanish } from "./eu-smpc";
export const refSchema = z.object({
  kind: z.enum(["fda_label", "eu_smpc", "pubmed"]),
  id: z.string(),
});
export const sourceSchema = z.object({
  ref: refSchema,
  title: z.string(),
  url: z.string(),
  citation: z.string(),
  country: z.string().optional(),
  language: z.string().optional(),
  design: z.enum([
    "regulatory_label",
    "rct",
    "controlled_trial",
    "cohort",
    "case_control",
    "case_series",
    "case_report",
    "review",
    "mechanistic",
    "animal",
    "other",
  ]),
  text: z.string(),
});
const identitySchema = z.object({
  id: z.string(),
  name: z.string(),
  brands: z.array(z.string()),
  synonyms: z.array(z.string()),
  classes: z.array(z.string()),
});
export const packetSchema = z.object({
  pair: z.templateLiteral([z.string(), "__", z.string()]),
  a: z.string(),
  b: z.string(),
  identities: z.array(identitySchema),
  sources: z.array(sourceSchema),
  prescan: z.array(z.object({ sourceId: z.string(), sentence: z.string() })),
  queries: z.array(z.string()).default([]),
});
export type Packet = z.infer<typeof packetSchema>;
const local: Record<string, string[]> = {
  alcohol: ["alcool", "alcohol", "etanol", "ethanol", "bebidas alcohólicas"],
  warfarin: ["anticoagulants", "anticoagulantes"],
  sertraline: ["ISRS"],
  ibuprofen: [
    "AINE",
    "AINS",
    "antiinflamatorios no esteroideos",
    "anti-inflammatoires non stéroïdiens",
  ],
  lorazepam: ["benzodiazepinas", "benzodiazépines"],
  alprazolam: ["benzodiazepinas", "benzodiazépines"],
  tramadol: ["opioides", "opioïdes"],
};
export function identity(id: string) {
  const e = catalog().find((e) => e.id === id),
    s = substances.find((s) => s.id === id);
  const sedating = [
    "hydroxyzine",
    "lorazepam",
    "alprazolam",
    "zolpidem",
    "diphenhydramine",
    "pregabalin",
  ].includes(id)
    ? [
        "depresores del sistema nervioso central",
        "dépresseurs du système nerveux central",
      ]
    : [];
  return {
    id,
    name: e?.name ?? s?.name ?? id,
    brands: e?.brands.map((b) => b.name) ?? s?.brands ?? [],
    synonyms: [
      ...(e?.synonyms ?? []),
      ...(s?.aliases ?? []),
      ...(local[id] ?? []),
      ...(spanish[id] ? [spanish[id]] : []),
      ...sedating,
    ],
    classes: label(id).classes.filter(
      (c) => !/^(enzyme inhibitors|enzyme inducers)$/i.test(c),
    ),
  };
}
export function terms(id: string) {
  const e = identity(id);
  return [e.name, ...e.brands, ...e.synonyms, ...e.classes];
}
const arr = (v: unknown): unknown[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const content = (v: unknown): string =>
  typeof v === "string" || typeof v === "number"
    ? String(v)
    : Array.isArray(v)
      ? v.map(content).join(" ")
      : v && typeof v === "object"
        ? Object.entries(v)
            .filter(([k]) => !k.startsWith("@_"))
            .map(([, x]) => content(x))
            .join(" ")
        : "";
export async function pubmed(a: string, b: string) {
  const term = (id: string) =>
    id === "alcohol" ? "(ethanol[tiab] OR alcohol[tiab])" : `"${id}"[tiab]`;
  const query = `${term(a)} AND ${term(b)} AND (interaction OR coadministration)`;
  const result = z
    .object({ esearchresult: z.object({ idlist: z.array(z.string()) }) })
    .parse(
      JSON.parse(
        await cached(
          "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=4&sort=relevance&term=" +
            encodeURIComponent(query),
        ),
      ),
    );
  const ids = result.esearchresult.idlist;
  const sources: Packet["sources"] = [];
  if (ids.length) {
    const xml = await cached(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=" +
        ids.join(","),
    );
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    for (const raw of arr(parsed.PubmedArticleSet?.PubmedArticle)) {
      const article = z
        .object({
          MedlineCitation: z.object({
            PMID: z.unknown(),
            Article: z.object({
              ArticleTitle: z.unknown(),
              Abstract: z.object({ AbstractText: z.unknown() }).optional(),
              PublicationTypeList: z.unknown().optional(),
              Journal: z.unknown().optional(),
            }),
          }),
        })
        .safeParse(raw);
      if (!article.success) continue;
      const m = article.data.MedlineCitation,
        id = content(m.PMID),
        text = content(m.Article.Abstract?.AbstractText);
      if (text)
        sources.push({
          ref: { kind: "pubmed", id },
          title: content(m.Article.ArticleTitle),
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          citation: content(m.Article.Journal),
          language: "en",
          design: publicationDesign([content(m.Article.PublicationTypeList)]),
          text,
        });
    }
  }
  return { sources, query };
}
export async function buildPackets() {
  const failures: unknown[] = [],
    reviewed = new Set(edges.map((e) => e.pair)),
    all = new Map([...pairs(), ...edges].map((p) => [p.pair, p]));
  const additions: { pair: string; sourceIds: string[] }[] = [];
  const todo = [...all.values()];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < todo.length) {
        const otherTerms = new Map<string, string[]>();
        const p = todo[cursor++],
          sources: Packet["sources"] = [];
        for (const [owner, target] of [
          [p.a, p.b],
          [p.b, p.a],
        ]) {
          const tt = terms(target);
          for (const section of label(owner).sections)
            otherTerms.set(section.id, tt);
          if (!reviewed.has(p.pair))
            for (const s of label(owner).sections.filter((s) =>
              /boxed_warning|contraindications|warning|precaution|drug_interactions|when_using|do_not_use|ask_doctor/.test(
                s.section,
              ),
            )) {
              const text = compact(s.text, tt);
              if (text)
                sources.push({
                  ref: { kind: "fda_label", id: s.id },
                  title: `${owner}: ${s.section}`,
                  url: s.url,
                  citation: `FDA label · ${s.section}`,
                  language: "en",
                  design: "regulatory_label",
                  text,
                });
            }
          for (const country of ["ES", "FR", "EU"]) {
            const path = `data/sources/eu/${country}/${owner}.json`;
            if (!existsSync(path)) continue;
            const eu = euSchema.parse(read(path));
            for (const s of eu.sections) {
              otherTerms.set(`${country}:${eu.registryId}#${s.section}`, tt);
              const text = compact(s.text, tt);
              if (text)
                sources.push({
                  ref: {
                    kind: "eu_smpc",
                    id: `${country}:${eu.registryId}#${s.section}`,
                  },
                  title: `${eu.product}: ${s.section}`,
                  url: s.url,
                  citation: `${country === "ES" ? "AEMPS CIMA" : country === "FR" ? "BDPM" : "European Medicines Agency"} · ${s.section}`,
                  country,
                  language: eu.language,
                  design: "regulatory_label",
                  text,
                });
            }
          }
        }
        const queries: string[] = [];
        if (!reviewed.has(p.pair)) {
          try {
            const pm = await pubmed(p.a, p.b);
            sources.push(...pm.sources);
            queries.push(pm.query);
          } catch (e) {
            failures.push({ pair: p.pair, error: String(e) });
          }
        }
        const unique = [...new Map(sources.map((s) => [s.ref.id, s])).values()];
        save(`data/batch/packets/${p.pair}.json`, {
          pair: p.pair,
          a: p.a,
          b: p.b,
          identities: [identity(p.a), identity(p.b)],
          sources: unique,
          prescan: unique.flatMap((s) =>
            sentences(s.text)
              .filter((t) =>
                mentions(
                  t,
                  otherTerms.get(s.ref.id) ?? [...terms(p.a), ...terms(p.b)],
                ),
              )
              .map((sentence) => ({ sourceId: s.ref.id, sentence })),
          ),
          queries,
        });
        if (reviewed.has(p.pair))
          additions.push({
            pair: p.pair,
            sourceIds: unique
              .filter((s) => s.ref.kind === "eu_smpc")
              .map((s) => s.ref.id),
          });
        process.stdout.write(`packet ${p.pair}: ${unique.length}\n`);
      }
    }),
  );
  save(
    "data/batch/eu-additions.json",
    additions.sort((a, b) => a.pair.localeCompare(b.pair)),
  );
  save("artifacts/M10b-packet-failures.json", failures);
  for (const file of readdirSync("data/batch/packets"))
    if (
      file.endsWith(".json") &&
      !all.has(file.slice(0, -5) as (typeof todo)[number]["pair"]) &&
      !existsSync(`data/batch/claims/${file}`)
    )
      unlinkSync("data/batch/packets/" + file);
  const packets = [...all.keys()].map((k) =>
    packetSchema.parse(read(`data/batch/packets/${k}.json`)),
  );
  save("artifacts/M10b-packets.json", {
    count: packets.length,
    reviewed: reviewed.size,
    sourceCounts: Object.fromEntries(
      ["fda_label", "eu_smpc", "pubmed"].map((k) => [
        k,
        packets.reduce(
          (n, p) => n + p.sources.filter((s) => s.ref.kind === k).length,
          0,
        ),
      ]),
    ),
    empty: packets.filter((p) => !p.sources.length).map((p) => p.pair),
  });
}
if (main("batch-packets.ts")) void buildPackets();
