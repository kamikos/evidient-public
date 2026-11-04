import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/batch.test.ts'], maxWorkers: 2 } });
