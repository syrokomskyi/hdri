import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/0-harvest-source/run/**/*.test.ts"],
  },
});
