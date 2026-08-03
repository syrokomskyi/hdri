import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/4-audit-lighthouse/run/**/*.test.ts"],
  },
});
