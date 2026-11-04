import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { substances } from "../data/substances";
import {
  cached,
  catalog,
  hash,
  main,
  norm,
  pairs,
  read,
  save,
} from "./batch-io";
export function htmlText(html: string): string {
  const cleaned = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(?:p|div|tr|h[1-6])>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return (
    new XMLParser({ ignoreAttributes: true, processEntities: true })
      .parse(
        "<text>" +
          cleaned.replace(/&(?!#\d+;|#x[\da-f]+;|[a-z]+;)/gi, "&amp;") +
          "</text>",
      )
      .text?.toString()
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() ?? ""
  );
}
export const euSchema = z.object({
  inn: z.string(),
  country: z.enum(["ES", "FR", "EU"]),
  language: z.enum(["es", "fr", "en"]),
  registryId: z.string(),
  product: z.string(),
  url: z.string(),
  retrievedAt: z.string(),
  licence: z.string(),
  terms: z.string(),
  attribution: z.string(),
  sha256: z.string(),
  documentUpdatedAt: z.string().nullable().optional(),
  sections: z.array(
    z.object({
      section: z.enum(["4.4", "4.5"]),
      text: z.string(),
      url: z.string(),
      sha256: z.string(),
    }),
  ),
});
export type EU = z.infer<typeof euSchema>;
const productSchema = z.object({
  nregistro: z.string(),
  nombre: z.string(),
  comerc: z.boolean(),
  vtm: z.object({ nombre: z.string() }).optional(),
  docs: z.array(
    z.object({
      tipo: z.number(),
      secc: z.boolean().optional(),
      fecha: z.number().optional(),
    }),
  ),
});
const searchSchema = z.object({
  totalFilas: z.number(),
  tamanioPagina: z.number(),
  resultados: z.array(productSchema),
});
export const spanish: Record<string, string> = {
  aspirin: "acido acetilsalicilico",
  acetaminophen: "paracetamol",
  methylphenidate: "metilfenidato",
  ibuprofen: "ibuprofeno",
  metronidazole: "metronidazol",
  sertraline: "sertralina",
  lorazepam: "lorazepam",
  warfarin: "warfarina",
  apixaban: "apixaban",
  tramadol: "tramadol",
  codeine: "codeina",
  diazepam: "diazepam",
  pregabalin: "pregabalina",
  bupropion: "bupropion",
  amoxicillin: "amoxicilina",
  clonazepam: "clonazepam",
  zolpidem: "zolpidem",
  diphenhydramine: "difenhidramina",
  cetirizine: "cetirizina",
  hydroxyzine: "hidroxizina",
  acitretin: "acitretina",
  adapalene: "adapaleno",
  alitretinoin: "alitretinoina",
  bexarotene: "bexaroteno",
  azathioprine: "azatioprina",
  aliskiren: "aliskiren",
  benazepril: "benazepril",
  buprenorphine: "buprenorfina",
  amiodarone: "amiodarona",
  amitriptyline: "amitriptilina",
  buspirone: "buspirona",
  apalutamide: "apalutamida",
  bromazepam: "bromazepam",
  bromfenac: "bromfenaco",
  abiraterone: "abiraterona",
};
export function targets() {
  return [
    ...new Set([
      ...substances.map((s) => s.id),
      ...pairs()

        .flatMap((p) => [p.a, p.b]),
    ]),
  ].filter((id) => id !== "alcohol");
}
async function spain(inn: string): Promise<EU> {
  const entry = catalog().find((c) => c.id === inn);
  const term =
    spanish[inn] ??
    entry?.synonyms.find((s) => /ina$|azol$|feno$/.test(s)) ??
    inn;
  const products: z.infer<typeof productSchema>[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = searchSchema.parse(
      JSON.parse(
        await cached(
          `https://cima.aemps.es/cima/rest/medicamentos?practiv1=${encodeURIComponent(term)}&pagina=${page}`,
        ),
      ),
    );
    products.push(...data.resultados);
    if (page * data.tamanioPagina >= data.totalFilas) break;
  }
  const candidates = products
    .filter(
      (p) =>
        p.comerc &&
        p.docs.some((d) => d.tipo === 1 && d.secc) &&
        p.vtm &&
        norm(p.vtm.nombre) === norm(term),
    )
    .sort((a, b) =>
      a.nregistro.localeCompare(b.nregistro, "en", { numeric: true }),
    );
  const p = candidates[0];
  if (!p)
    throw Error("No marketed single-ingredient segmented SmPC for " + term);
  const sections: EU["sections"] = [];
  for (const section of ["4.4", "4.5"] as const) {
    const url = `https://cima.aemps.es/cima/rest/docSegmentado/contenido/1?nregistro=${p.nregistro}&seccion=${section}`;
    const raw = await cached(url);
    const text = htmlText(raw);
    if (text.length < 40 || /^(?:\[|\{)/.test(text))
      throw Error("Invalid segmented section " + section);
    sections.push({ section, text, url, sha256: hash(text) });
  }
  return {
    inn,
    country: "ES",
    language: "es",
    registryId: p.nregistro,
    product: p.nombre,
    url: `https://cima.aemps.es/cima/dochtml/ft/${p.nregistro}/FT_${p.nregistro}.html`,
    retrievedAt: new Date().toISOString(),
    documentUpdatedAt: p.docs.find((d) => d.tipo === 1)?.fecha
      ? new Date(p.docs.find((d) => d.tipo === 1)!.fecha!).toISOString()
      : null,
    licence: "AEMPS reuse conditions; not asserted CC0",
    terms: "https://www.aemps.gob.es/aviso-legal/",
    attribution: `Fuente de la información: Agencia Española de Medicamentos y Productos Sanitarios www.aemps.gob.es. CIMA, retrieved ${new Date().toISOString().slice(0, 10)}. Extracted sections; original meaning preserved; no endorsement.`,
    sha256: hash(sections.map((s) => s.text).join("\n")),
    sections,
  };
}
function decode(b: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1252").decode(b);
  }
}
function frenchProduct(inn: string) {
  const entry = catalog().find((c) => c.id === inn);
  const names = new Set(
    [
      inn,
      entry?.name ?? inn,
      ...(entry?.synonyms ?? []),
      ...(substances.find((s) => s.id === inn)?.aliases ?? []),
    ].map(norm),
  );
  const comps = new Map<string, Set<string>>();
  for (const line of decode(
    gunzipSync(readFileSync("data/raw/m71/frpa.gz")),
  ).split(/\r?\n/)) {
    const r = line.split("\t");
    if (r[6] !== "SA") continue;
    const set = comps.get(r[0]) ?? new Set<string>();
    set.add(r[3]);
    comps.set(r[0], set);
  }
  return decode(gunzipSync(readFileSync("data/raw/m71/fr.gz")))
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter(
      (r) =>
        r[6] === "Commercialisée" &&
        comps.get(r[0])?.size === 1 &&
        [...(comps.get(r[0]) ?? [])].some(
          (n) =>
            names.has(norm(n)) ||
            names.has(
              norm(n).replace(
                /^(?:di)?chlorhydrate de |^bromhydrate de |^tartrate de |^fumarate de /,
                "",
              ),
            ) ||
            names.has(
              norm(n).replace(
                / (?:chlorhydrate|sodique|potassique|maleate|fumarate).*$/,
                "",
              ),
            ),
        ),
    )
    .sort((a, b) => a[0].localeCompare(b[0]))[0];
}
export function frenchSections(html: string): EU["sections"] {
  const out: EU["sections"] = [];
  for (const section of ["4.4", "4.5"] as const) {
    const anchor = section === "4.4" ? "RcpMisesEnGarde" : "RcpInteractionsMed";
    const start = html.indexOf(`name="${anchor}"`);
    if (start < 0) continue;
    const tail = html.slice(html.lastIndexOf("<a", start));
    const end = tail.slice(100).search(/<p[^>]+class=["']AmmAnnexeTitre2["']/i);
    if (end < 0) continue;
    const body = htmlText(tail.slice(0, end + 100));
    if (body.length > 80)
      out.push({ section, text: body, url: "", sha256: hash(body) });
  }
  return out;
}
async function france(inn: string): Promise<EU> {
  const p = frenchProduct(inn);
  if (!p) throw Error("No exact single-ingredient marketed CIS");
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${p[0]}/extrait`;
  const sections = frenchSections(await cached(url)).map((s) => ({
    ...s,
    url: url + "#tabpanel-rcp-panel",
  }));
  if (!sections.some((s) => s.section === "4.5"))
    throw Error("RCP 4.5 absent (possibly centralised EMA PDF)");
  return {
    inn,
    country: "FR",
    language: "fr",
    registryId: p[0],
    product: p[1],
    url,
    retrievedAt: new Date().toISOString(),
    documentUpdatedAt: "2026-11-03",
    licence: "Licence Ouverte / BDPM reuse terms",
    terms: "https://base-donnees-publique.medicaments.gouv.fr/telechargement",
    attribution: `Base de données publique des médicaments, ANSM, HAS, UNCAM; database updated 2026-11-03, retrieved ${new Date().toISOString().slice(0, 10)}; extracted RCP sections, meaning preserved; no endorsement.`,
    sha256: hash(sections.map((s) => s.text).join("\n")),
    sections,
  };
}
export async function fetchEU() {
  const failures: unknown[] = [];
  const jobs = targets().flatMap(inn => ["ES", "FR"].map(country => ({ inn, country })));
  let cursor = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < jobs.length) {
      const { inn, country } = jobs[cursor++];
      const path = `data/sources/eu/${country}/${inn}.json`;
      if (existsSync(path)) continue;
      try {
        save(path, await (country === "ES" ? spain(inn) : france(inn)));
        process.stdout.write(`${country} ${inn}: OK\n`);
      } catch (e) {
        failures.push({ inn, country, error: String(e) });
        process.stdout.write(`${country} ${inn}: ${String(e)}\n`);
      }
      save("artifacts/M10b-eu-failures.json", failures);
    }
  }));
  const coverage = targets().map((inn) => ({
    inn,
    ...Object.fromEntries(
      ["ES", "FR"].map((c) => [
        c,
        existsSync(`data/sources/eu/${c}/${inn}.json`)
          ? euSchema
              .parse(read(`data/sources/eu/${c}/${inn}.json`))
              .sections.map((s) => s.section)
          : [],
      ]),
    ),
  }));
  save("artifacts/M10b-eu-coverage.json", coverage);
}
if (main("eu-smpc.ts")) void fetchEU();
