import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, skipDbTests, type TestDb } from '../../supabase/tests/db';
import { buildSeedSql, DEMO, seedTargetProblem } from '../seed-data';

const hosted = (email: string) => buildSeedSql(undefined, { facilitatorEmail: email });

describe('demo seed', () => {
  it('is deterministic', () => {
    expect(buildSeedSql()).toBe(buildSeedSql());
  });

  it('matches the committed supabase/seed.sql (run `pnpm seed -- --write-only` after content or engine changes)', () => {
    const committed = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');
    const lf = (t: string) => t.replace(/\r\n/g, '\n');
    expect(lf(committed) === lf(buildSeedSql()), 'supabase/seed.sql is stale').toBe(true);
  });

  it('is labelled as demo data and puts the demo facilitator on the staff allowlist', () => {
    const sql = buildSeedSql();
    expect(sql).toContain('DEMO DATA');
    expect(sql).toContain(`insert into public.staff (email) values ('${DEMO.email}')`);
  });

  it('only loads into a local or CI database unless --allow-remote-demo is passed', () => {
    for (const url of [
      'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      'postgres://postgres:postgres@localhost:54330/postgres',
      'postgres://postgres:postgres@[::1]:5432/postgres',
      'postgres://postgres:postgres@postgres:5432/postgres',
    ]) {
      expect(seedTargetProblem(url, []), url).toBeNull();
    }
    const remote = 'postgres://postgres:secret@db.abcdefgh.supabase.co:5432/postgres';
    expect(seedTargetProblem(remote, [])).toMatch(/Refusing/);
    expect(seedTargetProblem(remote, ['--allow-remote-demo'])).toBeNull();
    expect(seedTargetProblem('not a url', [])).toMatch(/not a valid URL/);
  });

  it('hosted mode creates no auth user or password and keeps the demo class and students', () => {
    const sql = hosted('Lead@NGO.org');
    expect(sql).toContain('DEMO DATA');
    expect(sql).not.toContain(DEMO.password);
    expect(sql).not.toContain(DEMO.email);
    expect(sql).not.toMatch(/(insert into|delete from) auth\./);
    expect(sql).toContain(`insert into public.staff (email) values ('lead@ngo.org') on conflict (email) do nothing`);
    expect(sql).toContain(`'${DEMO.classCode}'`);
    // Same students, events and quizzes as the local seed.
    const body = (s: string) => s.slice(s.indexOf('insert into public.students'));
    expect(body(sql)).toBe(body(buildSeedSql()));
    expect(() => hosted('not-an-email')).toThrow(/Not an email/);
  });
});

// Skips locally when no test database is running; always runs in CI (see supabase/tests/db.ts).
describe.skipIf(skipDbTests)('demo seed in the database', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(() => db?.drop());

  it('loads (twice) and gives the dashboard something to show', async () => {
    // The seed runs its own transaction, so it needs one dedicated connection.
    const conn = await db.sql.reserve();
    await conn.unsafe(buildSeedSql());
    await conn.unsafe(buildSeedSql());
    conn.release();
    const progress = await db.asUser(DEMO.userId, (tx) => tx`select * from class_progress(${DEMO.classId})`);
    expect(progress).toHaveLength(24);
    expect(progress.filter((r) => Number(r.decisions) > 0)).toHaveLength(24);
    expect(progress.some((r) => r.last_active < new Date(Date.now() - 7 * 24 * 3600 * 1000))).toBe(true);
    const gains = await db.asUser(DEMO.userId, (tx) => tx`select * from learning_gain(${DEMO.classId})`);
    for (const row of gains) {
      expect(row.baseline_n).toBeGreaterThan(0);
      expect(row.n).toBe(row.baseline_n);
      expect(Number(row.endline_avg)).toBeGreaterThan(Number(row.baseline_avg));
    }
    const [{ code }] = (await db.sql`select class_code as code from classes where id = ${DEMO.classId}`) as [
      { code: string },
    ];
    expect(code).toBe('HYD234');
  });

  it('hosted mode needs an existing staff account, then gives it the demo class (re-runnable)', async () => {
    const email = 'lead.facilitator@example.org';
    const conn = await db.sql.reserve();
    try {
      await expect(conn.unsafe(hosted(email))).rejects.toThrow(/lead.facilitator@example.org has no account yet/);
      await conn.unsafe('rollback');
      // An account (an auth user) not on the allowlist: the seed adds it.
      const lead = await db.createFacilitator(email, false);
      await conn.unsafe(hosted(email));
      await conn.unsafe(hosted(email));
      const progress = await db.asUser(lead, (tx) => tx`select * from class_progress(${DEMO.classId})`);
      expect(progress).toHaveLength(24);
      expect(await db.sql`select 1 from auth.users where id = ${lead}`).toHaveLength(1);
    } finally {
      conn.release();
    }
  });
});
