/**
 * <MODULE_CONTRACT><purpose>Provide astro config behavior for the apps hdri dashboard subsystem and its direct callers.</purpose><non-goals><item>Do not define unrelated cross-workspace policy or orchestration behavior.</item></non-goals></MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing astro.config module contract for Compass-aware maintenance.</item>
</CHANGE_SUMMARY>
 */

import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  build: {
    format: "file",
    inlineStylesheets: "always",
  },
  server: {
    host: true,
  },
  vite: {
    server: {
      fs: {
        allow: ["../../.."],
      },
    },
  },
});
