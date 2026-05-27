import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['run/**/*.test.ts'],
  },
});
