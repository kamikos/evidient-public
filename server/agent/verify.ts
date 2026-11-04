import type { RunContext } from '../runContext';
import type { Claim, TraceEvent, SourceRef } from '../../shared/contract';
import { judgeBatch, judgeStructured, JUDGE_MODEL } from '../judge';
import { getSourceText } from '../tools/sourceStore';
import { mapConcurrent } from './runtime';
import { claimContainsAdvice } from './advice';

export type ProposedClaim = Omit<Claim, 'quoteCheck' | 'support' | 'judgeModel' | 'judgeRationale' | 'accepted'>;
export type Emit = (event: TraceEvent) => void;
export function normalizeQuote(text: string): string {
  return text.normalize('NFKC').replace(/[\u2018\u2019\u201a\u201b]/g, "'").replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}
export function quoteMatches(quote: string, text: string): boolean {
  const normalized = normalizeQuote(quote);
  return !!normalized && normalizeQuote(text).includes(normalized);
}
export function quoteContext(text: string, quote: string): string {
  const normalized = normalizeQuote(text);
  const start = normalized.indexOf(normalizeQuote(quote));
  if (start < 0) return '';
  const before = normalized.slice(0, start).split(/(?<=[.!?])\s+/).slice(-2).join(' ');
  const after = normalized.slice(start + normalizeQuote(quote).length).split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  return `${before}${normalizeQuote(quote)}${after}`;
}
export async function verifyClaims(proposed: ProposedClaim[], emit: Emit, options: {
  context?: RunContext;
  read?: (source: SourceRef) => Promise<string>; judge?: typeof judgeStructured; signal?: AbortSignal; pair?: string;
} = {}): Promise<Claim[]> {
  const contexts = new Map<string, string>();
  const checked = await mapConcurrent(proposed, 4, async claim => {
    options.signal?.throwIfAborted();
    let text: string;
    try { text = await (options.read ?? (ref => getSourceText(ref, options.signal, options.context)))(claim.source); }
    catch {
      options.signal?.throwIfAborted();
      emit({ type: 'quote_checked', claimId: claim.id, result: 'not_found' });
      return { ...claim, quoteCheck: 'not_found' as const, accepted: false, judgeRationale: 'Source text unavailable for checking' };
    }
    const matched = quoteMatches(claim.quote, text);
    emit({ type: 'quote_checked', claimId: claim.id, result: matched ? 'matched' : 'not_found' });
    if (!matched) return { ...claim, quoteCheck: 'not_found' as const, accepted: false };
    contexts.set(claim.id, quoteContext(text, claim.quote));
    return { ...claim, quoteCheck: 'matched' as const, accepted: false };
  });
  const eligible = checked.filter(c => c.quoteCheck === 'matched' && !claimContainsAdvice(c.text));
  const judgments = await judgeBatch(eligible.map(c => ({ claimId: c.id, claim: c.text, stance: c.stance, quote: c.quote, context: contexts.get(c.id), pair: options.pair })),
    `Assess whether this quote supports the ENTIRE claim, including population, direction and certainty. Universal certainty from a bounded study is overstated. A quoted warning that harm MAY occur does not support claiming harm occurred or inevitably occurs. When a pair is supplied, the claim must describe that co-exposure or explicit uncertainty about it. Monotherapy effects or unrelated comparators do not establish a pair interaction. Class statements are allowed only when clearly attributed and relevant to both substances. Also assess whether the stance label matches the quote: increases_risk requires reported risk or an explicitly attributed label restriction on this combination, no_effect_observed requires a measured null comparison between the combination and a control WITHOUT the interacting drug. Comparing subgroups who ALL received the interacting drug (such as CYP2C9-inhibitor SSRIs versus other SSRIs with warfarin) does NOT qualify, not a review finding no convincing evidence, mechanism requires an explicit mechanism, uncertain requires explicit uncertainty. A stance mismatch is does_not_support with a rationale. Return a one-sentence rationale.`, { ...options, emit });
  return checked.map(claim => {
    if (claim.quoteCheck !== 'matched') return claim;
    const judgment = claimContainsAdvice(claim.text) ? { support: 'overstated' as const, rationale: 'contains advice wording' } : judgments.get(claim.id)!;
    emit({ type: 'claim_judged', claimId: claim.id, ...judgment, model: JUDGE_MODEL });
    return { ...claim, quoteCheck: 'matched', support: judgment.support, judgeRationale: judgment.rationale,
      judgeModel: JUDGE_MODEL, accepted: judgment.support === 'supports' };
  });
}
