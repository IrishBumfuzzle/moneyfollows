// pnpm seed: regenerate supabase/seed.sql and load it into SUPABASE_DB_URL.
//   pnpm seed -- --write-only          only regenerate the file (supabase db reset loads it)
//   pnpm seed -- --allow-remote-demo   also allow a non-local database (not recommended)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { buildSeedSql, DEMO, seedTargetProblem } from './seed-data';

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

const problem = seedTargetProblem(url, process.argv);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const host = new URL(url).host;
console.warn(
  `WARNING: loading DEMO DATA into ${host}. Everything it creates is labelled demo data: ` +
    `class "${DEMO.className}" (${DEMO.classCode}), 24 fictional students, and a demo facilitator with a ` +
    'publicly known password. Never load it into a database real students use.',
);

const db = postgres(url, { max: 1, onnotice: () => {} });
try {
  await db.unsafe(sql);
  console.log(`Loaded demo data into ${host}: class ${DEMO.classCode}, facilitator ${DEMO.email} / ${DEMO.password}.`);
} finally {
  await db.end();
}
