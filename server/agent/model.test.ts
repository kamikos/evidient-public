import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRunContext } from '../runContext';
import { structured, withUsage, estimatedUSD, trackUsage, spendGuard } from './runtime';
import { judgeStructured } from '../judge';
const fake = vi.hoisted(() => ({ responses: { create: vi.fn() }, chat: { completions: { create: vi.fn() } } }));
vi.mock('../meta', () => ({ getMetaClient: () => fake, RESEARCH_MODEL: 'muse-spark-1.3', SYNTH_MODEL: 'muse-spark-1.3' }));
const schema = z.object({ support: z.literal('supports'), rationale: z.string() });
const judgment = { support: 'supports', rationale: 'The quote supports this claim.' };
beforeEach(() => { vi.clearAllMocks(); });
describe('model protocol compatibility', () => {
  it('retries invalid judge JSON once with strict Wonder Responses output', async () => {
    fake.responses.create.mockResolvedValueOnce({ output_text: 'not JSON' }).mockResolvedValueOnce({ output_text: JSON.stringify(judgment) });
    expect(await judgeStructured('Judge this claim', schema)).toEqual(judgment);
    expect(fake.responses.create).toHaveBeenCalledTimes(2);
    expect(fake.responses.create.mock.calls[0][0]).toMatchObject({ model: 'muse-wonder-1.0', reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', strict: true } } });
  });
  it('fails after two schema-invalid judge results', async () => {
    fake.responses.create.mockResolvedValue({ output_text: '{}' });
    await expect(judgeStructured('Judge', schema)).rejects.toThrow();
    expect(fake.responses.create).toHaveBeenCalledTimes(2);
  });
  it('falls back from a rejected Responses shape to chat structured output and tracks usage', async () => {
    fake.responses.create.mockRejectedValueOnce(Object.assign(new Error('Unsupported text.format'), { status: 400 }));
    fake.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(judgment) } }], usage: { prompt_tokens: 50, completion_tokens: 20 } });
    const usage = { input: 0, output: 0 };
    expect(await withUsage(usage, () => structured('Write JSON', schema, 'test'))).toEqual(judgment);
    expect(fake.responses.create.mock.calls[0][0].text.format.type).toBe('json_schema');
    expect(fake.chat.completions.create.mock.calls[0][0].response_format.type).toBe('json_schema');
    expect(usage).toMatchObject({ input: 50, output: 20 });
  });
  it('prices output including reasoning tokens per model', () => {
    expect(estimatedUSD({ input: 2000000, output: 2000000, byModel: { 'muse-spark-1.3': { input: 1000000, output: 1000000 }, 'muse-wonder-1.0': { input: 1000000, output: 1000000 } } })).toBe(29.5);
  });
  it('does not retry auth errors through a different API shape', async () => {
    fake.responses.create.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));
    await expect(structured('Write', schema, 'test')).rejects.toThrow('Unauthorized');
    expect(fake.chat.completions.create).not.toHaveBeenCalled();
  });
});

it('continues real judge transport for an admitted context after the daily threshold is crossed', async () => {
  vi.stubEnv('MODEL_SPEND_CAP_USD', '2.000001');
  const context = createRunContext(undefined, true);
  try {
    trackUsage(10000, 0, 'muse-wonder-1.0', context);
    expect(() => spendGuard(context)).toThrow('daily model budget reached');
    fake.responses.create.mockResolvedValueOnce({ output_text: JSON.stringify(judgment) });
    expect(await judgeStructured('Judge', schema, undefined, context)).toEqual(judgment);
    expect(fake.responses.create).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllEnvs(); }
});
