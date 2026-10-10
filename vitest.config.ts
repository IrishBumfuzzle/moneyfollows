import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'scripts/test/**/*.test.ts',
      'supabase/tests/**/*.test.ts',
    ],
    typecheck: { enabled: true, include: ['packages/shared/test/**/*.test.ts'] },
  },
});
