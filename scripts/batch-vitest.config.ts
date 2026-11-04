import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["scripts/ema-smpc.test.ts", "scripts/batch-pipeline.test.ts", "scripts/batch.test.ts"],
    maxWorkers: 2,
  },
});
