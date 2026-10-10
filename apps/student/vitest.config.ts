import { defineConfig } from 'vitest/config';

// Unit tests only; tests/*.e2e.mjs drive a real browser (pnpm e2e).
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
