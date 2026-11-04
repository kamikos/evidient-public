import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { judgeStructured } from '../server/judge';
import { respond, withUsage, estimatedUSD, type Usage } from '../server/agent/runtime';
async function main() {
const usage: Usage = { input: 0, output: 0 };
try {
  const events = readFileSync('artifacts/M8-live-ibuprofen-lisinopril.sse', 'utf8').split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
  const claims = events.filter(e => e.type === 'claim_proposed').map(e => ({ claimId: e.claim.id, claim: e.claim.text, stance: e.claim.stance, quote: e.claim.quote, pair: 'ibuprofen__lisinopril' }));
  const schema = z.object({ judgments: z.array(z.object({ claimId: z.string(), support: z.enum(['supports','partial','does_not_support','contradicts','overstated']), rationale: z.string() }).strict()) }).strict();
  const result = await withUsage(usage, () => judgeStructured(`Judge each claim against its quote and stance. Return judgments for each claimId.\n${JSON.stringify(claims)}`, schema));
  console.log(JSON.stringify({ success: true, usd: estimatedUSD(usage), output: result }));
} catch (error) {
  console.log(JSON.stringify({ success: false, status: error instanceof Error && 'status' in error ? error.status : null, message: error instanceof Error ? error.message.replace(/(sk-|key[_-])[A-Za-z0-9_-]+/g, '[redacted]') : 'unknown' }));
}

}
void main();
