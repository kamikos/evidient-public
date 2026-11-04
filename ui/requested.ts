import { useCallback, useEffect, useState } from "react";
import type { EvidenceRecord, PairKey } from "@/shared/contract";

// Cards the agent researched because this viewer asked. Per-device convenience: re-opening the pair
// shows the result without spending another run. Never sent anywhere.
const KEY = "evidient.requested.v1";
let memory: Record<string, EvidenceRecord> = {};

function read(): Record<string, EvidenceRecord> {
  try {
    if (typeof localStorage === "undefined") return memory;
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, EvidenceRecord>) : {};
  } catch {
    return memory;
  }
}

function write(all: Record<string, EvidenceRecord>) {
  memory = all;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: keep the in-memory copy for this session
  }
}

export const requestKey = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`) as PairKey;

export function useRequested(key: PairKey | null) {
  const [record, setRecord] = useState<EvidenceRecord | null>(null);
  useEffect(() => setRecord(key ? (read()[key] ?? null) : null), [key]);
  const save = useCallback(
    (rec: EvidenceRecord) => {
      if (!key) return;
      write({ ...read(), [key]: rec });
      setRecord(rec);
    },
    [key],
  );
  return { record, save };
}
