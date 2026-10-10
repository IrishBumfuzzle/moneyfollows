import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file: rely on the real environment (CI, deployed envs).
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
