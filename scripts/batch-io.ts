import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
export const read = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
export function save(p: string, value: unknown) {
  mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  writeFileSync(p + ".tmp", JSON.stringify(value, null, 2) + "\n");
  renameSync(p + ".tmp", p);
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const catalogSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    synonyms: z.array(z.string()),
    brands: z.array(
      z.object({ name: z.string(), markets: z.array(z.string()) }),
    ),
    kind: z.string().optional(),
  }),
);
let entries: z.infer<typeof catalogSchema> | undefined;
export const catalog = () =>
  (entries ??= catalogSchema.parse(read("data/catalog.json")));
export const reasonSchema = z.object({
  owner: z.string(),
  target: z.string(),
  section: z.string(),
  term: z.string(),
  kind: z.enum(["name", "class", "alcohol"]),
});
export const pairSchema = z.object({
  pair: z.templateLiteral([z.string(), "__", z.string()]),
  a: z.string(),
  b: z.string(),
  priority: z.number(),
  popularity: z.number(),
  reasons: z.array(reasonSchema),
});
export type Pair = z.infer<typeof pairSchema>;
export const pairs = () =>
  z.array(pairSchema).parse(read("data/batch/pairs-final.json"));
export const labelSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string(),
      section: z.string(),
      text: z.string(),
      url: z.string(),
    }),
  ),
  classes: z.array(z.string()),
});
export function label(id: string) {
  const p = `data/raw/batch-labels/substances/${id}.json`;
  return existsSync(p)
    ? labelSchema.parse(read(p))
    : { sections: [], classes: [] };
}
export function sentences(text: string) {
  return (
    text
      .match(/[\s\S]+?(?:[.!?]+(?=\s|$)|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [text]
  );
}
export function mentions(text: string, terms: string[]) {
  const n = " " + norm(text) + " ";
  return terms.some(
    (t) => norm(t).length > 2 && n.includes(" " + norm(t) + " "),
  );
}
export function compact(text: string, terms: string[]) {
  const ss = sentences(text);
  const keep = new Set<number>();
  ss.forEach((s, i) => {
    if (mentions(s, terms))
      for (let j = Math.max(0, i - 3); j <= Math.min(ss.length - 1, i + 3); j++)
        keep.add(j);
  });
  return ss.filter((_, i) => keep.has(i)).join("\n");
}
let last = 0;
let queue = Promise.resolve();
const pending = new Map<string, Promise<string>>();
export function cached(url: string): Promise<string> {
  const active = pending.get(url);
  if (active) return active;
  const request = fetchCached(url).finally(() => pending.delete(url));
  pending.set(url, request);
  return request;
}
async function fetchCached(url: string) {
  const p = `data/batch/http/${hash(url)}.json`;
  if (existsSync(p)) return z.object({ body: z.string() }).parse(read(p)).body;
  if (
    !/^https:\/\/(cima\.aemps\.es|base-donnees-publique\.medicaments\.gouv\.fr|eutils\.ncbi\.nlm\.nih\.gov|www\.aemps\.gob\.es|listadomedicamentos\.aemps\.gob\.es)\//.test(
      url,
    )
  )
    throw Error("Offline data host not allowed: " + url);
  const slot = queue.then(async () => {
    await new Promise((r) =>
      setTimeout(r, Math.max(0, 400 - (Date.now() - last))),
    );
    last = Date.now();
  });
  queue = slot;
  await slot;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw Error("HTTP " + r.status + " " + url);
      const body = await r.text();
      save(p, {
        url,
        retrievedAt: new Date().toISOString(),
        sha256: hash(body),
        body,
      });
      return body;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw Error("Unreachable");
}
export const main = (name: string) =>
  process.argv[1]?.replace(/\\/g, "/").endsWith("/" + name);
