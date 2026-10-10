import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../supabase/tests/db';
import { buildSeedSql, DEMO } from '../seed-data';

describe('demo seed', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(() => db?.drop());

  it('is deterministic', () => {
    expect(buildSeedSql()).toBe(buildSeedSql());
  });

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
      expect(Number(row.endline_avg)).toBeGreaterThan(Number(row.baseline_avg));
    }
    const [{ code }] = (await db.sql`select class_code as code from classes where id = ${DEMO.classId}`) as [
      { code: string },
    ];
    expect(code).toBe('HYD234');
  });
});
