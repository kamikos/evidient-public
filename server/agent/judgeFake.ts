import { z } from 'zod';
// Evaluate each item independently, matching the production batch protocol.
export function fakeJudgments<T>(prompt: string, schema: z.ZodType<T>, verdict: (item: string) => unknown): T {
  const parsed = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
  if (!Array.isArray(parsed)) return schema.parse(verdict(prompt));
  return schema.parse({ judgments: parsed.map(item => ({ claimId: item.claimId, ...verdict(JSON.stringify(item)) as object })) });
}
