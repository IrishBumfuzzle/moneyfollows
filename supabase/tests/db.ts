import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const ADMIN_URL = process.env.SUPABASE_TEST_DB_URL ?? 'postgres://postgres:postgres@localhost:54330/postgres';

export interface TestDb {
  sql: Sql;
  /** Runs `fn` as an anonymous student (the anon role). */
  asAnon<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  /** Runs `fn` as a signed-in facilitator (the authenticated role with that user id). */
  asUser<T>(userId: string, fn: (tx: Sql) => Promise<T>): Promise<T>;
  createFacilitator(email?: string): Promise<string>;
  drop(): Promise<void>;
}

/** A fresh database with the auth stub and every migration applied. */
export async function createTestDb(): Promise<TestDb> {
  const name = `paisa_test_${randomBytes(5).toString('hex')}`;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 4, onnotice: () => {} });

  await sql.unsafe(readFileSync(here('./auth-stub.sql'), 'utf8'));
  const dir = here('../migrations/');
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
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
    async createFacilitator(email = `${randomUUID()}@example.org`) {
      const id = randomUUID();
      await sql`insert into auth.users (id, email) values (${id}, ${email})`;
      return id;
    },
    async drop() {
      await sql.end();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
