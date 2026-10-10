import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, schema, type TestDb } from '../src';

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://paisa:paisa@localhost:5432/paisa_path';

describe('migrations', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb(ADMIN_URL);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('creates every table', async () => {
    const rows = await t.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'centres',
      'classes',
      'decision_events',
      'events',
      'game_saves',
      'organisations',
      'otp_codes',
      'quiz_attempts',
      'rewards',
      'staff_users',
      'student_profiles',
    ]);
  });

  it('has no personal-data columns on student tables', async () => {
    const rows = await t.db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'student_profiles'`,
    );
    const cols = rows.map((r) => r.column_name);
    for (const banned of ['name', 'real_name', 'phone', 'email', 'birth_date', 'dob', 'address']) {
      expect(cols).not.toContain(banned);
    }
  });

  it('keeps nicknames unique per class, ignoring case', async () => {
    const [org] = await t.db.insert(schema.organisations).values({ name: 'Org', city: 'Hyderabad' }).returning();
    const [centre] = await t.db.insert(schema.centres).values({ orgId: org!.id, name: 'C', type: 'school' }).returning();
    const [staff] = await t.db
      .insert(schema.staffUsers)
      .values({ orgId: org!.id, name: 'F', email: 'f@example.org', role: 'facilitator' })
      .returning();
    const [cls] = await t.db
      .insert(schema.classes)
      .values({ centreId: centre!.id, name: '11A', classCode: 'ABC234', defaultLanguage: 'hi', facilitatorId: staff!.id })
      .returning();
    await t.db.insert(schema.studentProfiles).values({ classId: cls!.id, nickname: 'Star', language: 'hi' });
    await expect(
      t.db.insert(schema.studentProfiles).values({ classId: cls!.id, nickname: 'STAR', language: 'hi' }),
    ).rejects.toThrow();
  });
});
