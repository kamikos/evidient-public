import { useEffect, useState } from "react";
import type { BatchIndexRow } from "@/shared/contract";

// Agent-built cards shipped with the app (data/batch). Loaded once; small (one row per pair).
let cache: BatchIndexRow[] | null = null;
let inflight: Promise<BatchIndexRow[]> | null = null;

export function loadBatchIndex(): Promise<BatchIndexRow[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/batch-index")
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: BatchIndexRow[] }>) : { rows: [] }))
      .then((d) => d.rows ?? [])
      .catch(() => [] as BatchIndexRow[])
      .then((rows) => {
        if (rows.length) cache = rows;
        inflight = null;
        return rows;
      });
  }
  return inflight;
}

export function useBatchIndex() {
  const [rows, setRows] = useState<BatchIndexRow[]>(cache ?? []);
  useEffect(() => {
    if (!cache) loadBatchIndex().then((r) => r.length && setRows(r));
  }, []);
  return rows;
}

export const batchRowsFor = (rows: BatchIndexRow[], id: string) => rows.filter((r) => r.a === id || r.b === id);
