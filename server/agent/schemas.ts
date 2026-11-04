import { z } from 'zod';
export const claimInput = z.object({ text: z.string().min(1), quote: z.string().min(1), sourceId: z.string().min(1),
  sourceKind: z.enum(['fda_label', 'pubmed']), stance: z.enum(['increases_risk', 'no_effect_observed', 'mechanism', 'uncertain']),
  outcome: z.string().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/),
}).strict();
export const gapInput = z.object({ text: z.string().min(1), searched: z.array(z.string()).min(1) }).strict();
export const supportSchema = z.object({ support: z.enum(['supports', 'partial', 'does_not_support', 'contradicts', 'overstated']), rationale: z.string().min(1) }).strict();
export const sentenceSchema = z.object({ text: z.string().min(1), claimIds: z.array(z.string()) }).strict();
export const synthesisSchema = z.object({ headline: sentenceSchema, reported: z.array(sentenceSchema), mechanism: z.array(sentenceSchema),
  conflicts: z.array(z.object({ outcome: z.string(), summary: sentenceSchema }).strict()),
}).strict();
export const metadataSchema = z.object({
  sampleSize: z.object({ value: z.number().int().positive(), quote: z.string().min(1) }).strict().nullable(),
  population: z.object({ value: z.string(), quote: z.string().min(1) }).strict().nullable(),
  limitations: z.array(z.object({ value: z.string(), quote: z.string().min(1) }).strict()),
}).strict();
