import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { edges } from "../data/edges";
import { quoteMatches } from "../server/agent/verify";
import { hash, main, pairs, read, save } from "./batch-io";
import { packetSchema } from "./batch-packets";
import { euSchema } from "./eu-smpc";
export function auditBatch() {
  const final = pairs(),
    keys = [
      ...new Set([...final.map((p) => p.pair), ...edges.map((e) => e.pair)]),
    ];
  const pp = keys.map((k) =>
    packetSchema.parse(read(`data/batch/packets/${k}.json`)),
  );
  const preserved = [
    "acitretin__alcohol",
    "adapalene__alcohol",
    "alcohol__allopurinol",
    "alcohol__alprostadil",
    "alcohol__amantadine",
    "alcohol__pregabalin",
  ].map((pair) => {
    const path = `data/batch/evidence/${pair}.json`;
    const before = execFileSync("git", ["show", `9aa4b82:${path}`], {
      encoding: "utf8",
    });
    const after = readFileSync(path, "utf8");
    if (hash(before) !== hash(after))
      throw Error("Muse record changed: " + pair);
    return { pair, sha256: hash(after) };
  });
  for (const p of pp) {
    if (!p.sources.length && !edges.some(e => e.pair === p.pair)) throw Error("Empty packet " + p.pair);
    for (const s of p.sources)
      if (s.ref.kind === "eu_smpc") {
        if (s.ref.id.split(":")[0] !== s.country || !s.language)
          throw Error("EU metadata");
      }
  }
  for (const pair of ["alcohol__bupropion", "adalimumab__azathioprine"]) {
    const record = z
      .object({
        card: z.object({
          claims: z.array(
            z.object({
              quote: z.string(),
              source: z.object({ id: z.string() }),
              accepted: z.boolean(),
              support: z.string().optional(),
            }),
          ),
        }),
      })
      .parse(read(`data/batch/evidence/${pair}.json`));
    const packet = packetSchema.parse(read(`data/batch/packets/${pair}.json`));
    for (const c of record.card.claims.filter((c) => c.accepted))
      if (
        c.support !== "supports" ||
        !quoteMatches(
          c.quote,
          packet?.sources.find((s) => s.ref.id === c.source.id)?.text ?? "",
        )
      )
        throw Error("Card quote mismatch");
  }
  const coverage = z
    .array(
      z.object({
        inn: z.string(),
        ES: z.array(z.string()),
        FR: z.array(z.string()),
      }),
    )
    .parse(read("artifacts/M10b-eu-coverage.json"));
  for (const c of coverage)
    for (const country of ["ES", "FR"] as const)
      if (c[country].length) {
        const e = euSchema.parse(
          read(`data/sources/eu/${country}/${c.inn}.json`),
        );
        for (const s of e.sections)
          if (s.sha256 !== hash(s.text)) throw Error("Source hash mismatch");
        if (e.sha256 !== hash(e.sections.map((s) => s.text).join("\n")))
          throw Error("Document hash mismatch");
      }
  const report = {
    finalPairs: final.length,
    filter: read("artifacts/M10b-filter.json"),
    reviewedPairs: edges.length,
    packets: read("artifacts/M10b-packets.json"),
    packetBytes: {
      total: keys.reduce(
        (n, k) => n + statSync(`data/batch/packets/${k}.json`).size,
        0,
      ),
      max: Math.max(
        ...keys.map((k) => statSync(`data/batch/packets/${k}.json`).size),
      ),
    },
    eu45: Object.fromEntries(
      ["ES", "FR"].map((country) => [
        country,
        coverage
          .filter((c) => (country === "ES" ? c.ES : c.FR).includes("4.5"))
          .map((c) => c.inn),
      ]),
    ),
    euFailures: read("artifacts/M10b-eu-failures.json"),
    packetFailures: read("artifacts/M10b-packet-failures.json"),
    slices: [0, 1, 2, 3, 4].map((n) => ({
      file: `data/batch/slices/slice-${n}.json`,
      count: z
        .array(z.unknown())
        .parse(read(`data/batch/slices/slice-${n}.json`)).length,
    })),
    preservedMuse: preserved,
    exampleJudge: "gpt-6.1-sol (self-check, replace)",
    labels: read("artifacts/M10b-label-coverage.json"),
    sharedDerivation: "FDA and EU regulatory labels count toward label_only and label signals; non-English quotations use quoteEnglish when available.",
  };
  save("artifacts/M10b-report.json", report);
  process.stdout.write(
    JSON.stringify(
      {
        pairs: report.finalPairs,
        reviewed: report.reviewedPairs,
        packets: report.packets,
        eu45: report.eu45,
        slices: report.slices,
      },
      null,
      2,
    ) + "\n",
  );
}
if (main("batch-audit.ts")) auditBatch();
