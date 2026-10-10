// pnpm seed: regenerate supabase/seed.sql and load it into SUPABASE_DB_URL.
//   pnpm seed -- --write-only          only regenerate the file (supabase db reset loads it)
//   pnpm seed -- --allow-remote-demo   also allow a non-local database (not recommended)
//   pnpm seed -- --hosted-demo <email> load the demo class into a hosted database, owned by
//                                      that invited staff account; no known-password user
//                                      is created and supabase/seed.sql is left alone
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { buildSeedSql, DEMO, seedTargetProblem, STAFF_EMAIL_RE } from './seed-data';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env: use the real environment.
}

const at = process.argv.indexOf('--hosted-demo');
if (at !== -1) await loadHostedDemo(process.argv[at + 1]);

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

async function loadHostedDemo(email: string | undefined): Promise<never> {
  const target = process.env.SUPABASE_DB_URL;
  if (!email || email.startsWith('--') || !STAFF_EMAIL_RE.test(email)) {
    console.error('Usage: pnpm seed -- --hosted-demo <invited staff email>   (with SUPABASE_DB_URL set)');
    process.exit(1);
  }
  if (!target) {
    console.error('SUPABASE_DB_URL is not set: point it at the hosted database (Project Settings -> Database).');
    process.exit(1);
  }
  const db = postgres(target, { max: 1, onnotice: () => {} });
  try {
    await db.unsafe(buildSeedSql(undefined, { facilitatorEmail: email }));
    console.log(
      `Loaded demo class ${DEMO.classCode} (24 demo students) into ${new URL(target).host}, owned by ${email.toLowerCase()}.`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await db.end();
  }
  process.exit(0);
}
