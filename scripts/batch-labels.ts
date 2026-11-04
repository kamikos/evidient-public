import { existsSync } from 'node:fs';
import { z } from 'zod';
import { discoverLabel, getDrugClasses } from '../server/agent/request';
import { installTransport, withOTC } from './batch-common';
import { catalog, label, main, read, save } from './batch-io';

export async function fetchLabels() {
  installTransport();
  const entries = catalog().filter(e => e.kind !== 'supplement' && e.id !== 'alcohol');
  const rx = z.array(z.object({ id: z.string(), rxcui: z.string().optional() })).parse(read('data/catalog.json'));
  const failures: { id: string; error: string }[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      const path = `data/raw/batch-labels/substances/${entry.id}.json`;
      if (existsSync(path)) continue;
      try {
        let sections: Awaited<ReturnType<typeof discoverLabel>> = [];
        for (let attempt = 0; attempt < 3; attempt++) {
          try { sections = withOTC(await discoverLabel(entry.name)); break; }
          catch (e) {
            if (attempt === 2) throw e;
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          }
        }
        const classes = entries.indexOf(entry) < 300 ? await getDrugClasses(rx.find(e => e.id === entry.id)?.rxcui) : [];
        save(path, { sections, classes });
        process.stdout.write(`${cursor}/${entries.length} ${entry.id}: ${sections.length}\n`);
      } catch (e) { failures.push({ id: entry.id, error: String(e) }); }
      save('artifacts/M10b-label-errors.json', failures);
    }
  }));
  save('artifacts/M10b-label-coverage.json', {
    total: entries.length,
    fetched: entries.filter(e => label(e.id).sections.length).length,
    missing: entries.filter(e => existsSync(`data/raw/batch-labels/substances/${e.id}.json`) && !label(e.id).sections.length).map(e => e.id),
    errors: failures,
  });
  if (failures.length) throw Error(`${failures.length} label fetch errors; rerun to resume`);
}
if (main('batch-labels.ts')) void fetchLabels();
