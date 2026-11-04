import { useEffect, useState } from "react";
import type { EvidenceRecord, PairKey } from "@/shared/contract";

const cache = new Map<PairKey, EvidenceRecord | null>();
const inflight = new Map<PairKey, Promise<EvidenceRecord | null>>();

async function load(pair: PairKey): Promise<EvidenceRecord | null> {
  if (cache.has(pair)) return cache.get(pair)!;
  if (!inflight.has(pair)) {
    inflight.set(
      pair,
      fetch(`/api/evidence/${pair}`)
        .then(async (r) => {
          if (r.ok) return { rec: (await r.json()) as EvidenceRecord, final: true };
          return { rec: null, final: r.status === 404 }; // 404 = not built; other errors may be transient
        })
        .catch(() => ({ rec: null, final: false }))
        .then(({ rec, final }) => {
          if (final) cache.set(pair, rec);
          inflight.delete(pair);
          return rec;
        }),
    );
  }
  return inflight.get(pair)!;
}

/** Precomputed evidence for many pairs (for line forms on the graph). */
export function useEvidenceMap(pairs: PairKey[]) {
  const [map, setMap] = useState<Partial<Record<PairKey, EvidenceRecord>>>({});
  const key = pairs.join("|");
  useEffect(() => {
    let alive = true;
    Promise.all(pairs.map(async (p) => [p, await load(p)] as const)).then((rows) => {
      if (!alive) return;
      const next: Partial<Record<PairKey, EvidenceRecord>> = {};
      rows.forEach(([p, r]) => r && (next[p] = r));
      setMap(next);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
