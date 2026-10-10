import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@paisa/db';
import { unlinkEndedClasses } from '../src/retention';
import { join, seedOrg, setup, type Harness } from './helpers';

describe('retention job', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await setup();
  });
  afterAll(() => h.close());

  it('unlinks students only from classes whose programme has ended', async () => {
    const ended = await seedOrg(h.db);
    const running = await seedOrg(h.db);
    const a = await join(h, ended.cls.classCode, 'Done');
    const b = await join(h, running.cls.classCode, 'Going');
    await h.db.update(schema.classes).set({ programmeEndsAt: new Date('2026-10-01') }).where(eq(schema.classes.id, ended.cls.id));
    await h.db.update(schema.classes).set({ programmeEndsAt: new Date('2027-03-01') }).where(eq(schema.classes.id, running.cls.id));

    expect(await unlinkEndedClasses(h.db, h.clock.now)).toBe(1);
    const rows = await h.db.select().from(schema.studentProfiles);
    const byId = Object.fromEntries(rows.map((r) => [r.anonId, r.classId]));
    expect(byId[a.profile.anonId]).toBeNull();
    expect(byId[b.profile.anonId]).toBe(running.cls.id);
    expect(await unlinkEndedClasses(h.db, h.clock.now)).toBe(0);
  });
});
