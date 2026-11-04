import { useCallback, useEffect, useRef, useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import type { Claim, EdgeCard, PairKey, TraceEvent } from "@/shared/contract";

export type Timed = TraceEvent & { t: number };

export interface LiveRun {
  events: Timed[];
  card: EdgeCard | null;
  running: boolean;
  error: string | null;
  claims: Claim[]; // ledger derived from events while the run streams
  start: (opts: { inject: boolean }) => void;
  stop: () => void;
}

/** Streams a live agent run from /api/evidence/<pair>?live=1 (SSE over fetch, works on web and native). */
export function useLiveRun(pair: PairKey, onCard?: (card: EdgeCard, trace: Timed[]) => void, streamUrl?: string): LiveRun {
  const [events, setEvents] = useState<Timed[]>([]);
  const [card, setCard] = useState<EdgeCard | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const stop = useCallback(() => {
    abort.current?.abort();
    setRunning(false);
  }, []);

  const start = useCallback(
    async ({ inject }: { inject: boolean }) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setEvents([]);
      setCard(null);
      setError(null);
      setRunning(true);
      const t0 = Date.now();
      const all: Timed[] = [];
      try {
        let nextUrl = streamUrl ?? `/api/evidence/${pair}?live=1${inject ? "&inject=1" : ""}`;
        let continuation: string | undefined;
        let terminal = false;
        while (!ctl.signal.aborted && !terminal) {
          const res = await expoFetch(nextUrl, {
            ...(continuation ? { method: "POST", body: JSON.stringify({ state: continuation }) } : {}),
            headers: { accept: "text/event-stream", ...(continuation ? { "content-type": "application/json" } : {}) },
            signal: ctl.signal,
          });
          if (!res.ok || !res.body) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(
              continuation
                ? `The live run could not continue (HTTP ${res.status}). ${body?.error ?? "Start a new run."}`
                : res.status === 503
                ? "Live runs are off on this demo. The saved card still works."
                : res.status === 409
                  ? "This pair is already on the reviewed list. Open it from the home screen."
                : res.status === 429
                  ? (body?.error ?? "You've reached the live-run limit for now. Try again later.")
                  : "The server couldn't start a live run. Try again in a minute.",
            );
          }
          let checkpoint: Extract<TraceEvent, { type: "checkpoint" }> | undefined;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done || ctl.signal.aborted) break;
            buf += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
              const frame = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const data = frame
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trimStart())
                .join("\n");
              if (!data) continue;
              const parsed = JSON.parse(data) as TraceEvent & { t?: number };
              const ev = { ...parsed, t: parsed.t ?? Date.now() - t0 } as Timed;
              if (ev.type === "checkpoint") { checkpoint = ev; continue; }
              all.push(ev);
              setEvents((prev) => [...prev, ev]);
              if (ev.type === "card_ready") {
                terminal = true;
                setCard(ev.card);
                onCard?.(ev.card, [...all]);
              }
              if (ev.type === "error") { terminal = true; setError(ev.message); }
            }
          }
          if (terminal) break;
          if (!checkpoint) throw new Error("The live stream ended before a card was ready. Start a new run.");
          if (!checkpoint.next.startsWith("/api/") || checkpoint.next.startsWith("//")) throw new Error("Invalid continuation path.");
          nextUrl = checkpoint.next;
          continuation = checkpoint.state;
        }
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof Error && e.message ? e.message : "The live run stopped. Try again in a minute.");
      } finally {
        if (abort.current === ctl) setRunning(false);
      }
    },
    [pair, onCard, streamUrl],
  );

  return { events, card, running, error, claims: ledgerFromEvents(events, card), start, stop };
}

function ledgerFromEvents(events: Timed[], card: EdgeCard | null): Claim[] {
  if (card) return card.claims;
  const map = new Map<string, Claim>();
  for (const e of events) {
    if (e.type === "claim_proposed") map.set(e.claim.id, { ...e.claim, quoteCheck: "matched", accepted: false, pending: true } as Claim & { pending: boolean });
    if (e.type === "quote_checked") {
      const c = map.get(e.claimId);
      if (c) map.set(e.claimId, { ...c, quoteCheck: e.result, ...(e.result === "not_found" ? { pending: false } : {}) });
    }
    if (e.type === "claim_judged") {
      const c = map.get(e.claimId);
      if (c) map.set(e.claimId, { ...c, support: e.support, judgeRationale: e.rationale, judgeModel: e.model, accepted: c.quoteCheck === "matched" && (e.support === "supports" || e.support === "partial"), pending: false } as Claim);
    }
  }
  return [...map.values()];
}
