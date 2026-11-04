// Add fetched EU evidence without refetching or dropping existing FDA/PubMed packets.
import { existsSync, readdirSync } from 'node:fs';
import { packetSchema, terms } from './batch-packets';
import { compact, main, read, save, sentences, mentions } from './batch-io';
import { euSchema } from './eu-smpc';
import { z } from 'zod';

export function enrichEUPackets() {
  const additions = z.array(z.object({ pair: z.string(), sourceIds: z.array(z.string()) })).parse(read('data/batch/eu-additions.json'));
  const changed: string[] = [];
  for (const file of readdirSync('data/batch/packets').filter(f => f.endsWith('.json'))) {
    const path = `data/batch/packets/${file}`;
    const packet = packetSchema.parse(read(path));
    let added = false;
    for (const [owner, partner] of [[packet.a, packet.b], [packet.b, packet.a]]) {
      const sourcePath = `data/sources/eu/EU/${owner}.json`;
      if (!existsSync(sourcePath)) continue;
      const eu = euSchema.parse(read(sourcePath));
      for (const section of eu.sections) {
        const id = `EU:${eu.registryId}#${section.section}`;
        const text = compact(section.text, terms(partner));
        if (!text || packet.sources.some(s => s.ref.id === id && s.text === text)) continue;
        packet.sources = packet.sources.filter(s => s.ref.id !== id);
        packet.prescan = packet.prescan.filter(s => s.sourceId !== id);
        packet.sources.push({ ref: { kind: 'eu_smpc', id }, title: `${eu.product}: ${section.section}`, url: section.url,
          citation: `${eu.attribution} SmPC ${section.section}`, country: eu.country, language: eu.language, design: 'regulatory_label', text });
        packet.prescan.push(...sentences(text).filter(s => mentions(s, terms(partner))).map(sentence => ({ sourceId: id, sentence })));
        added = true;
      }
    }
    if (added) {
      save(path, packet);
      changed.push(packet.pair);
      const addition = additions.find(a => a.pair === packet.pair);
      if (addition) addition.sourceIds = [...new Set([...addition.sourceIds, ...packet.sources.filter(s => s.ref.kind === 'eu_smpc').map(s => s.ref.id)])];
    }
  }
  save('data/batch/eu-additions.json', additions);
  console.log(`Enriched ${changed.length} packets`);
}
if (main('enrich-eu-packets.ts')) enrichEUPackets();
