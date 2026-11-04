import type { Usage } from './agent/runtime';
export interface RunContext {
  requests: { count: number; invocationCount: number; max: number; active: number; queue: (() => void)[] };
  sources: Map<string, string>;
  usage: Usage;
  memoryLedger: boolean;
  research: boolean;
}
export function createRunContext(max = Number(process.env.MAX_RUN_REQUESTS ?? 35), memoryLedger = false): RunContext {
  if (!Number.isInteger(max) || max < 1) throw new Error('MAX_RUN_REQUESTS must be a positive integer');
  return { requests: { count: 0, invocationCount: 0, max, active: 0, queue: [] }, sources: new Map(), usage: { input: 0, output: 0 }, memoryLedger, research: false };
}
