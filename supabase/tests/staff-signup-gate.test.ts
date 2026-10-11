import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, skipDbTests, type TestDb } from './db';

const REFUSED = { error: { http_code: 403, message: 'staff_not_invited' } };

// 20261011160000_staff_signup_gate.sql. Skips locally without a test database; always runs in CI.
describe.skipIf(skipDbTests)('staff sign-up gate', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await db.sql`insert into staff (email) values ('teacher@ngo.org')`;
  });
  afterAll(() => db?.drop());

  /** What Supabase Auth gets back for a sign-up with this email (the hook's event has more fields). */
  const gate = async (email: string | null) =>
    (await db.sql`select staff_signup_gate(${db.sql.json({ metadata: {}, user: { email } })}) as r`)[0]!.r;

  it('lets an email on the staff list create an account, whatever its case', async () => {
    expect(await gate('teacher@ngo.org')).toEqual({});
    expect(await gate('Teacher@NGO.org')).toEqual({});
  });

  it('refuses any other email, or none', async () => {
    expect(await gate('stranger@gmail.com')).toEqual(REFUSED);
    expect(await gate(null)).toEqual(REFUSED);
  });

  it('cannot be called by students or signed-in users', async () => {
    await expect(db.asAnon((tx) => tx`select staff_signup_gate('{}'::jsonb)`)).rejects.toThrow(/permission denied/);
    const id = await db.createFacilitator();
    await expect(db.asUser(id, (tx) => tx`select staff_signup_gate('{}'::jsonb)`)).rejects.toThrow(/permission denied/);
  });
});
