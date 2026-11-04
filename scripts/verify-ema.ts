// Offline integrity and pending-claim checks; no judgment or evidence acceptance.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { hash, read } from './batch-io';
import { euSchema } from './eu-smpc';
import { packetSchema } from './batch-packets';
import { claimsSchema } from './validate-batch';
import { quoteMatches } from '../server/agent/verify';

const manifest = z.object({ inputs: z.array(z.object({ file: z.string(), sha256: z.string() })) }).parse(read('data/sources/eu/ema-manifest.json'));
for (const input of manifest.inputs) {
  if (createHash('sha256').update(readFileSync(input.file)).digest('hex') !== input.sha256) throw Error(`Raw hash mismatch: ${input.file}`);
  if (input.file.endsWith('.pdf')) {
    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', input.file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (/©|copyright|all rights reserved/i.test(text)) throw Error(`Inspect third-party rights notice: ${input.file}`);
  }
}
const products = readdirSync('data/sources/eu/EU').filter(f => f.endsWith('.json')).map(f => euSchema.parse(read(`data/sources/eu/EU/${f}`)));
for (const product of products) {
  for (const section of product.sections) if (hash(section.text) !== section.sha256) throw Error('Section hash mismatch');
  if (hash(product.sections.map(s => s.text).join('\n')) !== product.sha256) throw Error('Combined text hash mismatch');
}
const pending = z.array(z.object({ pair: z.string(), claimIds: z.array(z.string()) })).parse(read('data/batch/ema-pending.json'));
for (const item of pending) {
  const draft = claimsSchema.parse(read(`data/batch/claims/${item.pair}.json`));
  const packet = packetSchema.parse(read(`data/batch/packets/${item.pair}.json`));
  for (const id of item.claimIds) {
    const claim = draft.claims.find(c => c.id === id);
    if (!claim) throw Error('Missing pending claim');
    const source = packet.sources.find(s => s.ref.id === claim.sourceId);
    const original = products.flatMap(p => p.sections.map(s => ({ id: `EU:${p.registryId}#${s.section}`, text: s.text }))).find(s => s.id === claim.sourceId);
    if (!source || !original || !quoteMatches(claim.quote, source.text) || !original.text.includes(claim.quote)) throw Error(`Pending quote mismatch: ${item.pair}`);
  }
}
const rows = z.array(z.object({ pair: z.string(), level: z.string() })).parse(read('data/batch/index.json'));
for (const row of rows) {
  const evidence = z.object({ card: z.object({ signal: z.object({ level: z.string() }) }) }).parse(read(`data/batch/evidence/${row.pair}.json`));
  if (row.level !== evidence.card.signal.level) throw Error(`Index level mismatch: ${row.pair}`);
}
console.log(`Verified ${products.length} EMA products, ${manifest.inputs.length} raw hashes, ${pending.length} pending drafts, ${rows.length} index levels; no third-party PDF notices found.`);
