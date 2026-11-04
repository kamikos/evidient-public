import { readFile, writeFile } from 'node:fs/promises';
import type { EvidenceRecord } from '../shared/contract';
import { computeSignal } from '../server/agent/derive';
import { quoteMatches } from '../server/agent/verify';
import { claimContainsAdvice } from '../server/agent/advice';
import { wordCount } from '../server/agent/textQuality';

async function main() {
  const file = 'data/evidence/alcohol__methylphenidate.json';
  const record: EvidenceRecord = JSON.parse(await readFile(file, 'utf8'));
  // Editorial review: keep the formulation and experimental alcohol concentration explicit.
  record.card.headline = { text: 'The label reports faster methylphenidate release from extended-release capsules at 40% alcohol.', claimIds: ['c1'] };
  record.card.reported[0] = { text: 'For the pinned extended-release capsule, the label reports 84% methylphenidate release in the first hour at 40% alcohol.', claimIds: ['c1'] };
  record.card.signal = computeSignal(record.card);
  const card = record.card;
  const sentences = [card.headline, ...card.reported, ...card.mechanism, ...card.conflicts.map(c => c.summary)];
  const accepted = card.claims.filter(c => c.accepted);
  for (const claim of accepted) {
    const snapshot = JSON.parse(await readFile(`data/sources/${claim.source.kind}/${claim.source.id.replace(/#/g, '__')}.json`, 'utf8'));
    if (!quoteMatches(claim.quote, snapshot.text)) throw new Error(`Quote mismatch ${claim.id}`);
  }
  if (!card.reported.length || wordCount(card.headline.text) > 25 || card.gaps.length > 1 || sentences.some(s => claimContainsAdvice(s.text) || !s.claimIds.length || s.claimIds.some(id => !accepted.some(c => c.id === id)))) throw new Error('Card quality failure');
  for (const event of record.trace) if (event.type === 'card_ready') event.card = card;
  await writeFile(file, JSON.stringify(record, null, 2) + '\n');
  await writeFile('artifacts/M7-card-review.json', JSON.stringify({ pair: card.pair, headline: card.headline.text, accepted: accepted.length, rejected: card.claims.length - accepted.length, gaps: card.gaps.length, signal: card.signal, depth: card.depth, checks: 'Matched accepted quotes against committed snapshots; non-empty reported; headline <=25 words; no advice; <=1 gap; accepted sentence citations.', editorialChange: 'Named pinned extended-release capsule and 40% experimental alcohol concentration; headline now foregrounds the label. PubMed design retained as other from publication metadata, so depth remains conservatively limited.' }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
