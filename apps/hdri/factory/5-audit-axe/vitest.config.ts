import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/5-audit-axe/run/**/*.test.ts"],
  },
});
