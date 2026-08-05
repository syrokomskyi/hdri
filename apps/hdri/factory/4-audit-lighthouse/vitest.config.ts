import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: "apps/hdri/.env" });

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/4-audit-lighthouse/run/**/*.test.ts"],
  },
});
