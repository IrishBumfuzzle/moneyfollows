import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end(),
  };
}

export type Db = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export { schema };

/** Applies every pending migration in packages/db/migrations. */
export async function migrateDb(url: string): Promise<void> {
  const { db, close } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  } finally {
    await close();
  }
}

export interface TestDb {
  db: Db;
  url: string;
  /** Closes the pool and drops the database. */
  drop(): Promise<void>;
}

/**
 * A fresh, migrated database for one test file, created next to the one in
 * `adminUrl` (TEST_DATABASE_URL or DATABASE_URL) and dropped afterwards.
 */
export async function createTestDb(adminUrl: string): Promise<TestDb> {
  const name = `paisa_test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = withDatabase(adminUrl, name);
  await migrateDb(url);
  const { db, close } = createDb(url, { max: 5 });
  return {
    db,
    url,
    async drop() {
      await close();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}
