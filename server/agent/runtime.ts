import { chargeUsage } from '../checkpoint';
import type { RunContext } from '../runContext';
import { AsyncLocalStorage } from 'node:async_hooks';
import OpenAI from 'openai';
import { z } from 'zod';
import { getMetaClient, SYNTH_MODEL } from '../meta';
export interface Usage { input: number; output: number; byModel?: Record<string, { input: number; output: number }> }
const usageScope = new AsyncLocalStorage<Usage>();
export function withUsage<T>(usage: Usage, work: () => Promise<T>) { return usageScope.run(usage, work); }
export function estimatedUSD(usage: Usage) {
  return Object.entries(usage.byModel ?? { 'muse-spark-1.3': usage }).reduce((sum, [model, tokens]) => {
    const [input, output] = model === 'muse-wonder-1.0' ? [4, 20] : [1.25, 4.25];
    return sum + (tokens.input * input + tokens.output * output) / 1e6;
  }, 0);
}
const memoryLedgerScope = new AsyncLocalStorage<boolean>();
export function withMemoryLedger<T>(work: () => Promise<T>) { return memoryLedgerScope.run(true, work); }
export class ModelBudgetError extends Error { constructor() { super('Live runs are paused: daily model budget reached'); } }
declare global { var evidientModelSpend: { day: string; usd: number } | undefined; }
const spend = globalThis.evidientModelSpend ??= { day: new Date().toISOString().slice(0, 10), usd: 0 };
function rollSpendDay() { const day = new Date().toISOString().slice(0, 10); if (day !== spend.day) { spend.day = day; spend.usd = 0; } }
// Only explicitly configured CLI runs persist spend. Hosting must leave this unset.
function ledgerFile(context?: RunContext) {
  return (context?.memoryLedger ?? memoryLedgerScope.getStore()) ? undefined : process.env.SPEND_LEDGER_FILE;
}
export function spendGuard(context?: RunContext) {
  rollSpendDay();
  const ledger = ledgerFile(context);
  let spent = spend.usd;
  if (ledger) {
    const { existsSync, readFileSync } = require('node:fs') as typeof import('node:fs');
    if (existsSync(ledger)) spent = readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).reduce((sum, line) => sum + Number(JSON.parse(line).usd), 0);
  }
  const cap = Number(process.env.MODEL_SPEND_CAP_USD ?? 20);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('Invalid model spend cap.');
  if (spent >= cap - 2) throw new ModelBudgetError();
}
export function trackUsage(input = 0, output = 0, model = SYNTH_MODEL, context?: RunContext) {
  rollSpendDay();
  const ledger = ledgerFile(context);
  const usd = estimatedUSD({ input, output, byModel: { [model]: { input, output } } });
  const fresh = chargeUsage(usd);
  if (fresh) spend.usd += usd;
  if (ledger && fresh) require('node:fs').appendFileSync(ledger, JSON.stringify({ at: new Date().toISOString(), model, input, output, usd: estimatedUSD({ input, output, byModel: { [model]: { input, output } } }) }) + '\n');
  const usage = context?.usage ?? usageScope.getStore();
  if (usage) { usage.input += input; usage.output += output;
    const models = usage.byModel ??= {};
    const tokens = models[model] ??= { input: 0, output: 0 };
    tokens.input += input; tokens.output += output; }
}
export type Respond = (params: OpenAI.Responses.ResponseCreateParamsNonStreaming, signal?: AbortSignal, context?: RunContext) => Promise<Pick<OpenAI.Responses.Response, 'id' | 'output' | 'output_text' | 'usage'>>;
export const respond: Respond = async (params, signal, context) => {
  if (!context) spendGuard();
  const result = await getMetaClient(context).responses.create(params, { signal });
  trackUsage(result.usage?.input_tokens, result.usage?.output_tokens, params.model, context);
  return result;
};
export type Structured = <T>(prompt: string, schema: z.ZodType<T>, name: string, signal?: AbortSignal, context?: RunContext) => Promise<T>;
export const structured: Structured = async (prompt, schema, name, signal, context) => {
  const jsonSchema = z.toJSONSchema(schema);
  try {
    const result = await respond({ model: SYNTH_MODEL, reasoning: { effort: 'low' }, input: prompt, text: { format: { type: 'json_schema', name, strict: true, schema: jsonSchema } } }, signal, context);
    return schema.parse(JSON.parse(result.output_text));
  } catch (error) {
    if (!(error instanceof Error) || !('status' in error) || ![400, 422].includes(Number(error.status))) throw error;
    if (!context) spendGuard();
    const result = await getMetaClient(context).chat.completions.create({ model: SYNTH_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: jsonSchema } },
    }, { signal });
    trackUsage(result.usage?.prompt_tokens, result.usage?.completion_tokens, SYNTH_MODEL, context);
    return schema.parse(JSON.parse(result.choices[0]?.message.content ?? 'null'));
  }
};
export async function mapConcurrent<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) { const i = index++; results[i] = await work(items[i]); }
  }));
  return results;
}

// Consume the terminal response, including finalized tool arguments and the continuation ID.
export const respondStreaming: Respond = async (params, signal, context) => {
  const client = getMetaClient(context);
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(new Error('Model request timed out')), client.timeout);
    try {
      if (!context) spendGuard();
      const stream = await client.responses.create({ ...params, stream: true }, { signal: combined, maxRetries: 0 });
      for await (const event of stream) {
        if (event.type === 'response.completed') {
          const result = event.response;
          trackUsage(result.usage?.input_tokens, result.usage?.output_tokens, params.model, context);
          return { ...result, output_text: result.output.filter(item => item.type === 'message').flatMap(item => item.content).filter(item => item.type === 'output_text').map(item => item.text).join('') };
        }
        if (event.type === 'response.failed') throw Object.assign(new Error('Upstream model generation failed'), { status: 500 });
        if (event.type === 'response.incomplete' || event.type === 'error') throw new Error('Upstream model response was incomplete');
      }
      throw new Error('Model stream ended before completion');
    } catch (error) {
      signal?.throwIfAborted();
      const retryable = controller.signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError || (error instanceof Error && 'status' in error && Number(error.status) >= 500);
      if (attempt || !retryable) throw error;
    } finally { clearTimeout(timer); }
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal?.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 500);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
};
