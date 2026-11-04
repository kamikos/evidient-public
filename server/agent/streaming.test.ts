import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';
import { respondStreaming } from './runtime';
const fake = vi.hoisted(() => ({ timeout: 120_000, responses: { create: vi.fn() } }));
vi.mock('../meta', () => ({ getMetaClient: () => fake, RESEARCH_MODEL: 'muse-spark-1.3', SYNTH_MODEL: 'muse-spark-1.3' }));
const completed = { type: 'response.completed', response: { id: 'r-final', output: [{ type: 'function_call', call_id: 'c', name: 'search_pubmed', arguments: '{"query":"pair"}', status: 'completed' }], usage: { input_tokens: 1, output_tokens: 1 } } };
async function* stream() { yield { type: 'response.function_call_arguments.delta', delta: '{' }; yield completed; }
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
describe('M3.1 upstream streaming', () => {
  it('consumes final tool arguments and response ID, retrying one 5xx with backoff', async () => {
    fake.responses.create.mockRejectedValueOnce(Object.assign(new Error('gateway'), { status: 504 })).mockResolvedValueOnce(stream());
    const work = respondStreaming({ model: 'test', input: 'test' });
    await vi.advanceTimersByTimeAsync(499); expect(fake.responses.create).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); const response = await work;
    expect(response.id).toBe('r-final'); expect(response.output[0]).toMatchObject({ arguments: '{"query":"pair"}' });
    expect(fake.responses.create.mock.calls[0][0].stream).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds each request at 120s and retries a timeout once', async () => {
    fake.responses.create.mockImplementationOnce((_params, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new OpenAI.APIUserAbortError())))).mockResolvedValueOnce(stream());
    const work = respondStreaming({ model: 'test', input: 'test' });
    await vi.advanceTimersByTimeAsync(120_499); expect(fake.responses.create).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect((await work).id).toBe('r-final'); expect(fake.responses.create).toHaveBeenCalledTimes(2);
  });
  it('stops after two 5xx failures and never retries auth or parent cancellation', async () => {
    fake.responses.create.mockRejectedValue(Object.assign(new Error('server'), { status: 500 }));
    const failed = expect(respondStreaming({ model: 'test', input: 'test' })).rejects.toThrow('server');
    await vi.advanceTimersByTimeAsync(500); await failed; expect(fake.responses.create).toHaveBeenCalledTimes(2);
    fake.responses.create.mockClear().mockRejectedValue(Object.assign(new Error('auth'), { status: 401 }));
    await expect(respondStreaming({ model: 'test', input: 'test' })).rejects.toThrow('auth'); expect(fake.responses.create).toHaveBeenCalledTimes(1);
    const controller = new AbortController(); controller.abort(new Error('disconnected'));
    await expect(respondStreaming({ model: 'test', input: 'test' }, controller.signal)).rejects.toThrow('disconnected');
    expect(vi.getTimerCount()).toBe(0);
  });
});
