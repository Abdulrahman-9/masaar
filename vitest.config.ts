import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@masaar/working-days': path.resolve(__dirname, 'packages/working-days/src/index.ts'),
      '@masaar/scpp-rules': path.resolve(__dirname, 'packages/scpp-rules/src/index.ts'),
      '@masaar/tokens': path.resolve(__dirname, 'packages/tokens/src/index.ts'),
      '@masaar/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.{ts,tsx}'],
  },
});
