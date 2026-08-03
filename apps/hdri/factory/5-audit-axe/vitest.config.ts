import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: "apps/hdri/.env" });

export default defineConfig({
  test: {
    include: ["apps/hdri/factory/5-audit-axe/run/**/*.test.ts"],
  },
});
