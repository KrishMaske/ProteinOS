import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    execArgv: ['--preserve-symlinks', '--preserve-symlinks-main'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'json-summary'] },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      'npm:zod@4.4.3': 'zod',
    },
  },
});
