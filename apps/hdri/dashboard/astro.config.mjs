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
