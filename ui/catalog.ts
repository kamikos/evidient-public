import { useEffect, useState } from "react";
import type { CatalogEntry, Market, Substance } from "@/shared/contract";

/**
 * The name catalogue (~1000 ingredients, US + EU brands) built deterministically from public registries.
 * Loaded once, searched on-device. Reviewed entries carry `substanceId`.
 */
let cache: CatalogEntry[] | null = null;
let inflight: Promise<CatalogEntry[]> | null = null;

export function loadCatalog(): Promise<CatalogEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/catalog")
      .then((r) => (r.ok ? (r.json() as Promise<CatalogEntry[]>) : []))
      .catch(() => [] as CatalogEntry[])
      .then((list) => {
        if (list.length) cache = list;
        inflight = null;
        return list;
      });
  }
  return inflight;
}

export function useCatalog() {
  const [list, setList] = useState<CatalogEntry[] | null>(cache);
  useEffect(() => {
    if (!cache) loadCatalog().then((l) => l.length && setList(l));
  }, []);
  return list;
}

/** Fold case and diacritics so "ibuprom", "Ibuprom", "paracetamolum" and "ł" all match. */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export interface Hit {
  entry: CatalogEntry;
  /** the name the person typed matched, e.g. "Medikinet", when it isn't the generic name */
  via?: string;
  score: number;
}

/** Exact > prefix > word-prefix > substring; reviewed entries win ties. */
export function searchCatalog(list: CatalogEntry[], query: string, limit = 8): Hit[] {
  const q = fold(query);
  if (!q) return [];
  const hits: Hit[] = [];
  for (const entry of list) {
    let best = 0;
    let via: string | undefined;
    const consider = (name: string, isGeneric: boolean) => {
      const n = fold(name);
      const s = n === q ? 4 : n.startsWith(q) ? 3 : n.split(/[\s-]+/).some((w) => w.startsWith(q)) ? 2 : q.length >= 3 && n.includes(q) ? 1 : 0;
      if (s > best) {
        best = s;
        via = isGeneric ? undefined : name;
      }
    };
    // Brands before synonyms so "Doliprane" (display-cased brand) wins over the all-caps registry spelling;
    // any non-generic match is shown back to the person ("Doliprane → Acetaminophen").
    consider(entry.name, true);
    entry.brands.forEach((b) => consider(b.name, false));
    entry.synonyms.forEach((n) => consider(n, false));
    if (best) hits.push({ entry, via, score: best * 10 + (entry.substanceId ? 5 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name)).slice(0, limit);
}

/** Before the catalogue loads (or if it fails), the reviewed substances still work as a mini catalogue. */
export function fromSubstances(subs: Substance[]): CatalogEntry[] {
  return subs.map((s) => ({
    id: s.id,
    name: s.name,
    synonyms: s.aliases.filter((a) => !(s.brands ?? []).some((b) => b.toLowerCase() === a)),
    brands: (s.brands ?? []).map((name) => ({ name, markets: ["US"] as Market[] })),
    substanceId: s.id,
    rxcui: s.rxcui,
    labelUrl: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(s.name)}`,
  }));
}

/** A few brands from each market, US first, so a European sees their box name too. */
export function brandList(entry: CatalogEntry, max = 4) {
  const order: Market[] = ["US", "PL", "FR", "IT", "ES", "NO", "CA", "EU"];
  const home = (markets: Market[]) => order.find((m) => markets.includes(m)) ?? "EU";
  const byMarket = order.map((m) => entry.brands.filter((b) => home(b.markets) === m).map((b) => b.name));
  const picked: string[] = [];
  for (let round = 0; round < max; round++) byMarket.forEach((list) => list[round] && picked.push(list[round]));
  return [...new Set(picked)].slice(0, max * 2);
}
