// Offline after the first fetch. Requires Poppler's pdftotext on PATH.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { euSchema, targets } from './eu-smpc';
import { hash, main, norm, read, save } from './batch-io';

const root = 'data/raw/eu-more';
const base = 'https://www.ema.europa.eu/en/documents/report/';
const manifestSchema = z.array(z.object({ url: z.string(), file: z.string(), sha256: z.string(), retrievedAt: z.string() }));
async function download(url: string) {
  if (!url.startsWith('https://www.ema.europa.eu/')) throw Error('Unexpected EMA host');
  mkdirSync(root, { recursive: true });
  const file = `${root}/${hash(url)}${url.endsWith('.pdf') ? '.pdf' : '.json'}`;
  const manifest = existsSync(`${root}/manifest.json`) ? manifestSchema.parse(read(`${root}/manifest.json`)) : [];
  let entry = manifest.find(m => m.url === url);
  if (!existsSync(file)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(`EMA HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(file, bytes);
    entry = { url, file, sha256: createHash('sha256').update(bytes).digest('hex'), retrievedAt: new Date().toISOString() };
    manifest.push(entry);
    save(`${root}/manifest.json`, manifest);
  }
  if (!entry || createHash('sha256').update(readFileSync(file)).digest('hex') !== entry.sha256) throw Error('EMA cache hash mismatch');
  return entry;
}

// Select the first complete SmPC only: subsequent formulations and the leaflet are excluded.
export function emaSections(raw: string, url: string) {
  const text = raw.replace(/\f/g, '\n').replace(/^\s*\d+\s*$/gm, '');
  const headings = [...text.matchAll(/^\s*(4\.[456])\s+([^\n]+)/gm)];
  const start = headings.findIndex(h => h[1] === '4.4' && /special warnings/i.test(h[2]));
  const selected = headings.slice(start, start + 3);
  if (start < 0 || selected.map(h => h[1]).join() !== '4.4,4.5,4.6' || !/interaction/i.test(selected[1][2])) throw Error('Incomplete EMA SmPC boundaries');
  return selected.slice(0, 2).map((h, i) => {
    const section = z.enum(['4.4', '4.5']).parse(h[1]);
    const body = text.slice(h.index, selected[i + 1].index).replace(/\s+/g, ' ').trim();
    if (body.length < 80) throw Error('Empty EMA section');
    return { section, text: body, url, sha256: hash(body) };
  });
}

export async function fetchEMA() {
  const medicines = await download(base + 'medicines-output-medicines_json-report_en.json');
  const documents = await download(base + 'documents-output-epar_documents_json-report_en.json');
  const ms = z.object({ data: z.array(z.object({ category: z.string(), medicine_status: z.string(), name_of_medicine: z.string(), ema_product_number: z.string(), international_non_proprietary_name_common_name: z.string(), generic: z.string(), medicine_url: z.string() })) }).parse(read(medicines.file)).data;
  const ds = z.object({ data: z.array(z.object({ type: z.string(), ema_product_number: z.string(), document_url: z.string(), last_updated_date: z.string() })) }).parse(read(documents.file)).data;
  const requested = process.argv.find(a => a.startsWith('--inn='))?.slice(6).split(',') ?? targets();
  const failures: { inn: string; error: string }[] = [];
  for (const inn of requested) {
    const path = `data/sources/eu/EU/${inn}.json`;
    if (existsSync(path)) continue;
    const candidates = ms.filter(m => m.category === 'Human' && m.medicine_status === 'Authorised' && norm(m.international_non_proprietary_name_common_name) === norm(inn))
      .sort((a, b) => (a.generic === 'Yes' ? 1 : 0) - (b.generic === 'Yes' ? 1 : 0) || a.name_of_medicine.localeCompare(b.name_of_medicine));
    try {
      const product = candidates[0];
      const doc = product && ds.find(d => d.ema_product_number === product.ema_product_number && d.type === 'product-information' && d.document_url.endsWith('_en.pdf'));
      if (!doc) throw Error('No authorised exact single-INN English product information');
      const input = await download(doc.document_url);
      const raw = execFileSync('pdftotext', ['-enc', 'UTF-8', input.file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      const sections = emaSections(raw, doc.document_url);
      save(path, euSchema.parse({ inn, country: 'EU', language: 'en', registryId: product.ema_product_number, product: product.name_of_medicine,
        url: doc.document_url, retrievedAt: input.retrievedAt, documentUpdatedAt: doc.last_updated_date,
        licence: 'EMA legal notice: reproduction with attribution; third-party exceptions apply', terms: 'https://www.ema.europa.eu/en/about-us/about-website/legal-notice',
        attribution: `European Medicines Agency, ${product.name_of_medicine}, ${doc.document_url}, accessed ${input.retrievedAt.slice(0, 7)}. Extracted SmPC sections, whitespace normalised; no endorsement.`,
        sha256: hash(sections.map(s => s.text).join('\n')), sections }));
      console.log(`EU ${inn}: ${product.name_of_medicine}`);
    } catch (error) { failures.push({ inn, error: String(error) }); }
  }
  save('data/sources/eu/ema-manifest.json', { inputs: manifestSchema.parse(read(`${root}/manifest.json`)), failures });
  console.log(`${failures.length} EMA failures; see ema-manifest.json`);
}
if (main('ema-smpc.ts')) void fetchEMA();
