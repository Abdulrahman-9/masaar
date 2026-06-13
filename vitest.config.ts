import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@masaar/working-days': path.resolve(__dirname, 'packages/working-days/src/index.ts'),
      '@masaar/scpp-rules': path.resolve(__dirname, 'packages/scpp-rules/src/index.ts'),
      '@masaar/tokens': path.resolve(__dirname, 'packages/tokens/src/index.ts'),
      '@masaar/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@masaar/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
    },
  },
  // NestJS services use class decorators — enable them for esbuild (jsx kept for web tests)
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        jsx: 'react-jsx',
      },
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.{ts,tsx}',
      'apps/*/test/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
