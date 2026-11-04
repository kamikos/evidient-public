import { useEffect, useState } from "react";
import type { FestDrugFile, FestRecord } from "@/shared/contract";
import { color, severity } from "@/ui/theme";

// Norway's national interaction database (DMP FEST, NLOD), shipped as static files per substance.
const cache = new Map<string, FestDrugFile | null>();
const inflight = new Map<string, Promise<FestDrugFile | null>>();

export function loadFest(id: string): Promise<FestDrugFile | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id)!);
  if (!inflight.has(id)) {
    inflight.set(
      id,
      fetch(`/fest/${encodeURIComponent(id)}.json`)
        .then(async (r) => (r.ok ? ((await r.json()) as FestDrugFile) : null))
        .catch(() => null)
        .then((f) => {
          cache.set(id, f);
          inflight.delete(id);
          return f;
        }),
    );
  }
  return inflight.get(id)!;
}

export function useFest(id: string | null | undefined) {
  const [file, setFile] = useState<FestDrugFile | null>(id ? (cache.get(id) ?? null) : null);
  useEffect(() => {
    let alive = true;
    if (!id) return setFile(null);
    loadFest(id).then((f) => alive && setFile(f));
    return () => {
      alive = false;
    };
  }, [id]);
  return file;
}

export const festFor = (file: FestDrugFile | null, other: string): FestRecord[] => file?.rows.find((r) => r.other === other)?.records ?? [];

/** FEST's own three grades, with a close English rendering. These are Norway's ratings, quoted, not Evidient's. */
export const festGrade: Record<FestRecord["relevance"], { en: string; rank: number; mark: string; bars: number }> = {
  "1": { en: "Should be avoided", rank: 3, mark: severity.label_advises_against.mark, bars: 2 },
  "2": { en: "Take precautions", rank: 2, mark: severity.label_mentions.mark, bars: 1 },
  "3": { en: "No action needed", rank: 1, mark: color.inkFaint, bars: 0 },
};

export const FEST_SOURCE = "DMP, FEST (Norway’s national medicines database)";
export const FEST_URL = "https://www.dmp.no/globalassets/documents/om-oss/distribusjon-av-legemiddeldata/fest/festfiler/fest251.zip";
export const festDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
