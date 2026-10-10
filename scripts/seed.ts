// pnpm seed: regenerate supabase/seed.sql and load it into SUPABASE_DB_URL.
//   pnpm seed -- --write-only   only regenerate the file (supabase db reset loads it)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { buildSeedSql, DEMO } from './seed-data';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env: use the real environment.
}

const file = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url));
const sql = buildSeedSql();
writeFileSync(file, sql);
console.log(`Wrote ${file}`);

const url = process.env.SUPABASE_DB_URL;
if (process.argv.includes('--write-only') || !url) {
  if (!url) console.log('SUPABASE_DB_URL is not set: skipped loading. Run `npx supabase db reset` to load it.');
  process.exit(0);
}

const db = postgres(url, { max: 1, onnotice: () => {} });
try {
  await db.unsafe(sql);
  console.log(
    `Loaded demo data into ${new URL(url).host}: class ${DEMO.classCode}, facilitator ${DEMO.email} / ${DEMO.password} (local only).`,
  );
} finally {
  await db.end();
}
