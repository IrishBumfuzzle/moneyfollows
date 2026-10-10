import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const ADMIN_URL = process.env.SUPABASE_TEST_DB_URL ?? 'postgres://postgres:postgres@localhost:54330/postgres';

/**
 * True if something listens on the test database's host and port. Without a
 * database the SQL tests skip locally, but in CI (process.env.CI) they always run,
 * so a missing database fails the build.
 */
export function testDbReachable(timeoutMs = 1500): Promise<boolean> {
  const url = new URL(ADMIN_URL);
  return new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 5432) });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Skip the SQL tests: no database locally, and not in CI. */
export const skipDbTests = !process.env.CI && !(await testDbReachable());
if (skipDbTests) console.warn(`SQL tests skipped: no test database at ${new URL(ADMIN_URL).host} (pnpm db:test:up).`);

export interface TestDb {
  sql: Sql;
  /** Runs `fn` as an anonymous student (the anon role). */
  asAnon<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  /** Runs `fn` as a signed-in facilitator (the authenticated role with that user id). */
  asUser<T>(userId: string, fn: (tx: Sql) => Promise<T>): Promise<T>;
  /** An auth user; on the staff allowlist unless `staff` is false. */
  createFacilitator(email?: string, staff?: boolean): Promise<string>;
  /** Applies the migrations `migrationsBefore` held back (for testing a migration's backfill). */
  applyRemainingMigrations(): Promise<void>;
  drop(): Promise<void>;
}

export interface TestDbOptions {
  /** Apply only migrations whose file name sorts before this (e.g. '20261011120500'). */
  migrationsBefore?: string;
}

/** Built by make-template.sh in the supabase/postgres test container (docker-compose.yml). */
const SUPABASE_TEMPLATE = 'paisa_template';

/**
 * A fresh database with every migration applied. On Supabase's Postgres image it is a copy of
 * the real initialised database (roles, default grants, auth schema); on plain Postgres the
 * auth stub stands in for those.
 */
export async function createTestDb(options: TestDbOptions = {}): Promise<TestDb> {
  const name = `paisa_test_${randomBytes(5).toString('hex')}`;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  const [tpl] = await admin`select 1 from pg_database where datname = ${SUPABASE_TEMPLATE} and datistemplate`;
  await admin.unsafe(`create database ${name}${tpl ? ` template ${SUPABASE_TEMPLATE}` : ''}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 4, onnotice: () => {} });

  if (!tpl) await sql.unsafe(readFileSync(here('./auth-stub.sql'), 'utf8'));
  const dir = here('../migrations/');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const held = options.migrationsBefore ? files.filter((f) => f >= options.migrationsBefore!) : [];
  for (const file of files.filter((f) => !held.includes(f))) {
    await sql.unsafe(readFileSync(dir + file, 'utf8'));
  }

  const as =
    (role: 'anon' | 'authenticated', userId?: string) =>
    async <T>(fn: (tx: Sql) => Promise<T>): Promise<T> =>
      (await sql.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        if (userId) await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
        return fn(tx as unknown as Sql);
      })) as T;

  return {
    sql,
    asAnon: as('anon'),
    asUser: (userId, fn) => as('authenticated', userId)(fn),
    async createFacilitator(email = `${randomUUID()}@example.org`, staff = true) {
      const id = randomUUID();
      await sql`insert into auth.users (id, email) values (${id}, ${email})`;
      if (staff) await sql`insert into staff (email) values (${email.toLowerCase()})`;
      return id;
    },
    async applyRemainingMigrations() {
      for (const file of held.splice(0)) await sql.unsafe(readFileSync(dir + file, 'utf8'));
    },
    async drop() {
      await sql.end();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
