import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/3-extract-profile/run/**/*.test.ts"],
  },
});
