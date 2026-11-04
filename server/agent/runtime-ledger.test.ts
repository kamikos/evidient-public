import { mkdtempSync, existsSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { trackUsage, withMemoryLedger } from './runtime';

it('never opens a ledger in route scope even when the CLI file is configured', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'evidient-ledger-'));
  const file = path.join(directory, 'spend.jsonl');
  vi.stubEnv('SPEND_LEDGER_FILE', file);
  try {
    await withMemoryLedger(async () => { trackUsage(10, 20); });
    expect(existsSync(file)).toBe(false);
    trackUsage(10, 20);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ input: 10, output: 20 });
  } finally {
    vi.unstubAllEnvs();
    if (existsSync(file)) unlinkSync(file);
    rmdirSync(directory);
  }
});
