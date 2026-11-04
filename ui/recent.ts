import { useCallback, useEffect, useState } from "react";
import type { SubstanceId } from "@/shared/contract";

// Per-device convenience only: what this viewer checked recently. Never sent anywhere.
const KEY = "evidient.recent.v1";
const MAX = 6;
let memory: SubstanceId[][] = [];

function read(): SubstanceId[][] {
  try {
    if (typeof localStorage === "undefined") return memory;
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed.filter((x) => Array.isArray(x)) as SubstanceId[][]) : [];
  } catch {
    return memory;
  }
}

function write(list: SubstanceId[][]) {
  memory = list;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // private mode or storage blocked: memory copy still works for this session
  }
}

const same = (a: SubstanceId[], b: SubstanceId[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function useRecent() {
  const [list, setList] = useState<SubstanceId[][]>([]);
  useEffect(() => setList(read()), []);
  const push = useCallback((ids: SubstanceId[]) => {
    if (ids.length < 2) return;
    const next = [ids, ...read().filter((x) => !same(x, ids))].slice(0, MAX);
    write(next);
    setList(next);
  }, []);
  const clear = useCallback(() => {
    write([]);
    setList([]);
  }, []);
  return { recent: list, push, clear };
}
