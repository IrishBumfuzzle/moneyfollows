import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassInfo, ClassProgress, LearningGains } from '@paisa/contracts';
import { schema } from '@paisa/db';
import { bearer, join, seedOrg, setup, staffToken, type Harness } from './helpers';

describe('staff sign-in', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await setup({ OTP_DEV_ECHO: 'true' });
    await seedOrg(h.db, { email: 'teacher@example.org' });
  });
  afterAll(() => h.close());

  const request = (email: string) => h.app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { email } });
  const verify = (email: string, code: string) => h.app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: { email, code } });

  it('emails a code and exchanges it for a session token', async () => {
    const res = await request('Teacher@Example.org');
    expect(res.json().sent).toBe(true);
    expect(h.sent.at(-1)!.email).toBe('teacher@example.org');
    expect(res.json().devCode).toBe(h.sent.at(-1)!.code);

    const ok = await verify('teacher@example.org', h.sent.at(-1)!.code);
    expect(ok.statusCode).toBe(200);
    const me = await h.app.inject({ method: 'GET', url: '/v1/auth/me', headers: bearer(ok.json().token) });
    expect(me.json()).toMatchObject({ email: 'teacher@example.org', role: 'facilitator' });
    // Single use.
    expect((await verify('teacher@example.org', h.sent.at(-1)!.code)).statusCode).toBe(401);
  });

  it('answers the same for unknown emails and limits resends and guesses', async () => {
    const unknown = await request('nobody@example.org');
    expect(unknown.json()).toEqual({ sent: true });

    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    await request('teacher@example.org');
    expect((await request('teacher@example.org')).statusCode).toBe(429);
    const real = h.sent.at(-1)!.code;
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify('teacher@example.org', wrong)).statusCode).toBe(401);
    expect((await verify('teacher@example.org', real)).statusCode).toBe(429);
  });

  it('expires codes', async () => {
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    await request('teacher@example.org');
    const code = h.sent.at(-1)!.code;
    h.clock.now = new Date(h.clock.now.getTime() + 11 * 60_000);
    expect((await verify('teacher@example.org', code)).statusCode).toBe(401);
  });

  it('refuses student tokens on staff routes', async () => {
    const { cls } = await seedOrg(h.db);
    const { token } = await join(h, cls.classCode, 'Sneaky');
    expect((await h.app.inject({ method: 'GET', url: '/v1/classes', headers: bearer(token) })).statusCode).toBe(403);
  });
});

describe('classes, progress and learning gains', () => {
  let h: Harness;
  let a: Awaited<ReturnType<typeof seedOrg>>;
  let b: Awaited<ReturnType<typeof seedOrg>>;
  let tokenA: string;
  beforeAll(async () => {
    h = await setup();
    a = await seedOrg(h.db);
    b = await seedOrg(h.db);
    tokenA = staffToken(h, a.facilitator);
  });
  afterAll(() => h.close());

  it('creates a class with a readable join code', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/classes',
      headers: bearer(tokenA),
      payload: { centreId: a.centre.id, name: 'Class 12 B', defaultLanguage: 'en' },
    });
    const cls = ClassInfo.parse(res.json());
    expect(cls.classCode).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(cls.facilitatorId).toBe(a.facilitator.id);
    const list = (await h.app.inject({ method: 'GET', url: '/v1/classes', headers: bearer(tokenA) })).json();
    expect(list.map((c: ClassInfo) => c.name).sort()).toEqual(['Class 11 A', 'Class 12 B']);
  });

  it("keeps facilitators out of other NGOs' centres and classes", async () => {
    const create = await h.app.inject({
      method: 'POST',
      url: '/v1/classes',
      headers: bearer(tokenA),
      payload: { centreId: b.centre.id, name: 'Nope', defaultLanguage: 'en' },
    });
    expect(create.statusCode).toBe(403);
    for (const url of [`/v1/classes/${b.cls.id}`, `/v1/classes/${b.cls.id}/progress`, `/v1/reports/learning-gains?classId=${b.cls.id}`]) {
      expect((await h.app.inject({ method: 'GET', url, headers: bearer(tokenA) })).statusCode, url).toBe(404);
    }
    // An NGO admin sees every class in their own NGO only.
    const admin = staffToken(h, a.admin);
    expect((await h.app.inject({ method: 'GET', url: `/v1/classes/${a.cls.id}`, headers: bearer(admin) })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'GET', url: `/v1/classes/${b.cls.id}`, headers: bearer(admin) })).statusCode).toBe(404);
  });

  it('shows a progress heatmap with inactive flags', async () => {
    const active = await join(h, a.cls.classCode, 'Active');
    await join(h, a.cls.classCode, 'Quiet');
    const sync = (events: object[]) =>
      h.app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(active.token), payload: { events } });
    const at = h.clock.now.toISOString();
    await sync([
      { eventId: randomUUID(), profileId: active.profile.anonId, type: 'decision_made', occurredAt: at, seq: 1, payload: { scenarioId: 'safe.otp.01', choiceId: 'a', pillar: 'stay_safe' } },
      { eventId: randomUUID(), profileId: active.profile.anonId, type: 'decision_made', occurredAt: at, seq: 2, payload: { scenarioId: 'budget.bus_pass.01', choiceId: 'a', pillar: 'plan_budget' } },
      { eventId: randomUUID(), profileId: active.profile.anonId, type: 'module_complete', occurredAt: at, seq: 3, payload: { pillar: 'stay_safe' } },
    ]);

    const res = await h.app.inject({ method: 'GET', url: `/v1/classes/${a.cls.id}/progress`, headers: bearer(tokenA) });
    const progress = ClassProgress.parse(res.json());
    const byName = Object.fromEntries(progress.students.map((s) => [s.nickname, s]));
    expect(byName['Active']).toMatchObject({ inactive: false, modulesComplete: ['stay_safe'] });
    expect(byName['Active']!.pillars).toEqual({ plan_budget: 1, save_manage: 0, understand_investing: 0, stay_safe: 1 });
    expect(byName['Quiet']!.inactive).toBe(true);
  });

  it('reports learning gains, hiding small cells from Vanguard', async () => {
    const students = await Promise.all(Array.from({ length: 3 }, (_, i) => join(h, b.cls.classCode, `Learner ${i}`)));
    for (const s of students) {
      for (const [kind, correct] of [
        ['baseline', 1],
        ['endline', 2],
      ] as const) {
        await h.db.insert(schema.quizAttempts).values({
          profileId: s.profile.anonId,
          classId: b.cls.id,
          kind,
          questionIds: [],
          score: correct * 50,
          byPillar: { stay_safe: { correct, total: 2 } },
          submittedAt: h.clock.now,
        });
      }
    }
    const adminB = staffToken(h, b.admin);
    const gains = LearningGains.parse((await h.app.inject({ method: 'GET', url: '/v1/reports/learning-gains', headers: bearer(adminB) })).json());
    expect(gains).toMatchObject({ students: 3, paired: 3, minCell: 1, overall: { baseline: 50, endline: 100 } });
    expect(gains.byPillar.stay_safe).toEqual({ baseline: 50, endline: 100 });
    expect(gains.byPillar.plan_budget).toEqual({ baseline: null, endline: null });

    const [vanguard] = await h.db.insert(schema.staffUsers).values({ name: 'V', email: 'v@example.org', role: 'vanguard' }).returning();
    const v = staffToken(h, vanguard!);
    const vg = LearningGains.parse((await h.app.inject({ method: 'GET', url: `/v1/reports/learning-gains?orgId=${b.org.id}`, headers: bearer(v) })).json());
    expect(vg.minCell).toBe(10);
    expect(vg.byPillar.stay_safe).toEqual({ baseline: null, endline: null });
    expect((await h.app.inject({ method: 'GET', url: `/v1/reports/learning-gains?classId=${b.cls.id}`, headers: bearer(v) })).statusCode).toBe(403);
    expect((await h.app.inject({ method: 'GET', url: '/v1/classes', headers: bearer(v) })).statusCode).toBe(403);
  });

  it('lets an NGO admin add centres and facilitators, and Vanguard add NGOs', async () => {
    const admin = staffToken(h, a.admin);
    const centre = await h.app.inject({ method: 'POST', url: '/v1/centres', headers: bearer(admin), payload: { name: 'Community Hall', type: 'community_centre' } });
    expect(centre.json().orgId).toBe(a.org.id);
    const staff = await h.app.inject({ method: 'POST', url: '/v1/staff', headers: bearer(admin), payload: { name: 'New F', email: 'NEW@example.org', role: 'facilitator' } });
    expect(staff.json()).toMatchObject({ email: 'new@example.org', orgId: a.org.id });
    expect((await h.app.inject({ method: 'POST', url: '/v1/staff', headers: bearer(admin), payload: { name: 'Xavier', email: 'x@example.org', role: 'vanguard' } })).statusCode).toBe(403);
    expect((await h.app.inject({ method: 'POST', url: '/v1/orgs', headers: bearer(admin), payload: { name: 'New NGO', city: 'Hyderabad' } })).statusCode).toBe(403);
  });
});
