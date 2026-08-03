import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/1-register-businesses/run/**/*.test.ts"],
  },
});
