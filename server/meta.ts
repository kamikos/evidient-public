import type { RunContext } from './runContext';
import { externalFetch } from './requests';
import OpenAI from 'openai';
import { z } from 'zod';
import { getEnv } from './env';

export const RESEARCH_MODEL = 'muse-spark-1.3';
export const SYNTH_MODEL = 'muse-spark-1.3';

export function modelTimeoutMs() {
  const value = Number(process.env.MODEL_API_TIMEOUT_MS ?? 120_000);
  if (!Number.isFinite(value) || value <= 0) throw new Error('MODEL_API_TIMEOUT_MS must be a positive number');
  return value;
}

export function getMetaClient(context?: RunContext) {
  const apiKey = getEnv().modelApiKey;
  if (!apiKey) throw new Error('MODEL_API_KEY is not configured');
  return new OpenAI({ baseURL: 'https://api.meta.ai/v1', apiKey, timeout: modelTimeoutMs(), maxRetries: 0, fetch: (input, init) => externalFetch(input instanceof URL ? input.href : input, init, context) });
}

type CreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming;
export type FunctionTool = OpenAI.Responses.FunctionTool;

export function createResponse(input: CreateParams['input'], tools: FunctionTool[] = []) {
  for (const tool of tools) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(tool.name)) throw new Error('Invalid function name');
  }
  return getMetaClient().responses.create({ model: RESEARCH_MODEL, input, tools, tool_choice: 'auto', parallel_tool_calls: true });
}

export function continueResponse(previousResponseId: string, outputs: { call_id: string; output: string }[], tools: FunctionTool[] = []) {
  return getMetaClient().responses.create({
    model: RESEARCH_MODEL, previous_response_id: previousResponseId,
    input: outputs.map(output => ({ type: 'function_call_output', ...output })),
    tools, tool_choice: 'auto', parallel_tool_calls: true,
  });
}

export async function structuredResponse<T>(input: CreateParams['input'], schema: z.ZodType<T>, name = 'result') {
  const response = await getMetaClient().responses.create({
    model: SYNTH_MODEL, input,
    text: { format: { type: 'json_schema', name, strict: true, schema: z.toJSONSchema(schema) } },
  });
  return schema.parse(JSON.parse(response.output_text));
}
