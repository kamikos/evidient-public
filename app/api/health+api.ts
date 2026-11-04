import { getEnv } from '../../server/env';
import { RESEARCH_MODEL } from '../../server/meta';
import { JUDGE_MODEL } from '../../server/judge';

export async function GET() {
  if (!getEnv().modelApiKey) return Response.json({ ok: false, reason: 'MODEL_API_KEY is not configured' });
  // Public health checks must not trigger paid inference outside the live quotas.
  return Response.json({ ok: true, model: RESEARCH_MODEL, judge: JUDGE_MODEL });
}
