import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClassProgressRow, JoinClassResult, LearningGainRow, QuizAnswer, SyncEvent } from '@paisa/shared';
import { createTestDb, skipDbTests, type TestDb } from './db';

type GainRow = LearningGainRow & { n: number };

// Skips locally when no test database is running; always runs in CI (see db.ts).
describe.skipIf(skipDbTests)('database', () => {
  let db: TestDb;
  let facilitator: string;
  let otherFacilitator: string;
  let cls: { id: string; class_code: string };
  let otherCls: { id: string; class_code: string };

  beforeAll(async () => {
    db = await createTestDb();
    facilitator = await db.createFacilitator();
    otherFacilitator = await db.createFacilitator();
    [cls] = await db.asUser(
      facilitator,
      (tx) => tx`insert into classes (name, default_lang) values ('Class 11 A', 'hi') returning id, class_code`,
    );
    [otherCls] = await db.asUser(
      otherFacilitator,
      (tx) => tx`insert into classes (name, default_lang) values ('Class 12 B', 'en') returning id, class_code`,
    );
  });
  afterAll(() => db?.drop());

  const join = (code: string, nickname: string) =>
    db.asAnon(async (tx) => (await tx`select join_class(${code}, ${nickname}) as r`)[0]!.r as JoinClassResult);

  const push = (events: unknown[]) =>
    db.asAnon(
      async (tx) =>
        (await tx`select push_events(${tx.json(events as never)}) as r`)[0]!.r as {
          accepted: number;
          rejected: string[];
        },
    );

  // The map and news types (5.5) until BE-1's contracts PR adds them to SyncEvent['type'].
  type EventType =
    | SyncEvent['type']
    | 'map_opened'
    | 'location_selected'
    | 'week_slept'
    | 'glossary_term_opened'
    | 'news_question_answered'
    | 'news_edition_completed';
  const ev = (
    s: JoinClassResult,
    type: EventType,
    payload: Record<string, unknown> = {},
    ts = '2026-10-10T10:00:00+05:30',
  ): Omit<SyncEvent, 'type'> & { type: EventType } => ({
    event_id: randomUUID(),
    anon_id: s.anon_id,
    class_id: s.class_id,
    type,
    payload,
    client_ts: ts,
    content_version: '2026.10.10',
  });

  const count = async (q: Promise<unknown>) => ((await q) as [{ n: number }])[0].n;

  describe('classes', () => {
    it('get a readable 8-character code and the signed-in facilitator by default', async () => {
      expect(cls.class_code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
      expect(otherCls.class_code).not.toBe(cls.class_code);
      const [row] = await db.sql`select facilitator_id from classes where id = ${cls.id}`;
      expect(row!.facilitator_id).toBe(facilitator);
    });

    it('are visible only to their facilitator', async () => {
      const mine = await db.asUser(facilitator, (tx) => tx`select id from classes`);
      expect(mine.map((r) => r.id)).toEqual([cls.id]);
      const sneaky = await db.asUser(
        facilitator,
        (tx) => tx`update classes set name = 'hacked' where id = ${otherCls.id} returning id`,
      );
      expect(sneaky).toEqual([]);
      await expect(
        db.asUser(
          facilitator,
          (tx) => tx`insert into classes (name, facilitator_id) values ('x', ${otherFacilitator})`,
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it('do not let a facilitator choose or change the code', async () => {
      await expect(
        db.asUser(facilitator, (tx) => tx`insert into classes (name, class_code) values ('x', 'AAAAAAAA')`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.asUser(facilitator, (tx) => tx`update classes set class_code = 'AAAAAAAA' where id = ${cls.id}`),
      ).rejects.toThrow(/permission denied/);
      // Renaming is still allowed.
      const renamed = await db.asUser(
        facilitator,
        (tx) => tx`update classes set name = 'Class 11 A' where id = ${cls.id} returning id`,
      );
      expect(renamed).toHaveLength(1);
    });

    it('only accept codes from the readable alphabet', async () => {
      for (const code of ['abc234', 'HYD23', 'HYD2340AB', 'HYD0O1']) {
        await expect(
          db.sql`insert into classes (name, class_code, facilitator_id) values ('x', ${code}, ${facilitator})`,
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('need a staff allowlist entry: other signed-in users are not facilitators', async () => {
      const outsider = await db.createFacilitator(undefined, false);
      await expect(
        db.asUser(outsider, (tx) => tx`insert into classes (name, default_lang) values ('Mine', 'en')`),
      ).rejects.toThrow(/row-level security/);
      // Even a class that names them is invisible until they are on the allowlist.
      await db.sql`insert into classes (name, facilitator_id) values ('Orphan', ${outsider})`;
      expect(await db.asUser(outsider, (tx) => tx`select id from classes`)).toEqual([]);
      expect(await db.asUser(outsider, (tx) => tx`select * from class_progress(${cls.id})`)).toEqual([]);
    });

    it('survive an attempt to delete their facilitator (restrict, not cascade)', async () => {
      // Postgres raises 23503 foreign_key_violation for on delete restrict (23001 is never used for it).
      await expect(db.sql`delete from auth.users where id = ${facilitator}`).rejects.toMatchObject({
        code: '23503',
        constraint_name: 'classes_facilitator_id_fkey',
      });
      expect(await count(db.sql`select count(*)::int as n from classes where id = ${cls.id}`)).toBe(1);
    });

    it('are not readable by students', async () => {
      await expect(db.asAnon((tx) => tx`select * from classes`)).rejects.toThrow(/permission denied/);
      await expect(db.asAnon((tx) => tx`select * from students`)).rejects.toThrow(/permission denied/);
      await expect(db.asAnon((tx) => tx`select * from staff`)).rejects.toThrow(/permission denied/);
    });
  });

  describe('join_class', () => {
    it('creates an anonymous profile and returns the class language', async () => {
      const r = await join(cls.class_code.toLowerCase(), '  Chai Star ');
      expect(r).toEqual({ anon_id: expect.any(String), class_id: cls.id, default_lang: 'hi' });
      const [s] = await db.sql`select nickname, lang, level from students where anon_id = ${r.anon_id}`;
      expect(s).toEqual({ nickname: 'Chai Star', lang: 'hi', level: 'starter' });
    });

    it('rejects unknown codes, taken nicknames, abuse and personal info', async () => {
      await expect(join('ZZZZZZZZ', 'Asha')).rejects.toMatchObject({ code: 'PT404', message: 'class_not_found' });
      await expect(join(cls.class_code, 'chai star')).rejects.toMatchObject({
        code: 'PT409',
        message: 'nickname_taken',
      });
      await expect(join(cls.class_code, 'G4ndu')).rejects.toMatchObject({ code: 'PT422', message: 'nickname_blocked' });
      await expect(join(cls.class_code, 'Asha 98765 43210')).rejects.toMatchObject({
        message: 'nickname_personal_info',
      });
      await expect(join(cls.class_code, 'a@b.in')).rejects.toMatchObject({ message: 'nickname_personal_info' });
      await expect(join(cls.class_code, 'x')).rejects.toMatchObject({ message: 'nickname_invalid' });
      await expect(join(cls.class_code, '<script>')).rejects.toMatchObject({ message: 'nickname_invalid' });
    });

    it('checks the nickname before the code, so a bad nickname reveals nothing about the code', async () => {
      for (const code of ['ZZZZZZZZ', cls.class_code]) {
        await expect(join(code, 'x')).rejects.toMatchObject({ code: 'PT422', message: 'nickname_invalid' });
        await expect(join(code, 'G4ndu')).rejects.toMatchObject({ code: 'PT422', message: 'nickname_blocked' });
      }
    });

    it('normalises nicknames before filtering them', async () => {
      const cases: [string, string][] = [
        ['98765_43210', 'nickname_personal_info'],
        ['9.8.7.6.5', 'nickname_personal_info'],
        ['Asha ९८७६५', 'nickname_personal_info'], // Devanagari digits
        ['fuuuck', 'nickname_blocked'],
        ['phuck', 'nickname_blocked'],
        ['F.u.c.k', 'nickname_blocked'],
        ['ｆｕｃｋ', 'nickname_blocked'], // full-width letters, folded by NFKC
        ['Big Dick', 'nickname_blocked'],
        ['s h i t', 'nickname_blocked'],
        ['Sex69', 'nickname_blocked'],
        ['Chutiyaa', 'nickname_blocked'],
        ['Аsha', 'nickname_invalid'], // Cyrillic А
        ['Asha सितारा', 'nickname_invalid'], // mixed scripts
        ['_ - .', 'nickname_invalid'], // separators only
      ];
      for (const [nick, message] of cases) {
        await expect(join(otherCls.class_code, nick), nick).rejects.toMatchObject({ code: 'PT422', message });
      }
    });

    it('lets innocent names that contain a blocked word through', async () => {
      for (const nick of ['Essex', 'Dickens', 'Nazia', 'Grape Juice']) {
        await expect(join(otherCls.class_code, nick), nick).resolves.toMatchObject({ class_id: otherCls.id });
      }
    });

    it('allows the same nickname in a different class, and Hindi nicknames', async () => {
      await expect(join(otherCls.class_code, 'Chai Star')).resolves.toMatchObject({ default_lang: 'en' });
      await expect(join(cls.class_code, 'सितारा')).resolves.toMatchObject({ class_id: cls.id });
    });

    it('throttles new students per class per minute', async () => {
      const [rate] = await db.asUser(
        facilitator,
        (tx) => tx`insert into classes (name, default_lang) values ('Rate test', 'en') returning class_code`,
      );
      for (let i = 1; i <= 60; i++) await join(rate!.class_code, `Rate Kid ${i}`);
      await expect(join(rate!.class_code, 'Rate Kid 61')).rejects.toMatchObject({
        code: 'PT429',
        message: 'join_rate_limited',
      });
    });

    it('caps a class at 300 students', async () => {
      const [full] = await db.asUser(
        facilitator,
        (tx) => tx`insert into classes (name, default_lang) values ('Full test', 'en') returning id, class_code`,
      );
      await db.sql`
        insert into students (class_id, nickname, lang, created_at)
        select ${full!.id}, 'Kid ' || g, 'en', now() - interval '1 hour' from generate_series(1, 300) g`;
      await expect(join(full!.class_code, 'One More')).rejects.toMatchObject({ code: 'PT403', message: 'class_full' });
    });
  });

  describe('push_events', () => {
    let student: JoinClassResult;
    let other: JoinClassResult;
    beforeAll(async () => {
      student = await join(cls.class_code, 'Offline One');
      other = await join(otherCls.class_code, 'Offline Two');
    });

    it('is idempotent on event_id', async () => {
      const batch = [
        ev(student, 'app_open'),
        ev(student, 'decision_made', { scenarioId: 'budget.recharge.01', choiceId: 'a', pillar: 'plan_budget' }),
      ];
      expect(await push(batch)).toEqual({ accepted: 2, rejected: [] });
      expect(await push(batch)).toEqual({ accepted: 2, rejected: [] });
      expect(await count(db.sql`select count(*)::int as n from events where anon_id = ${student.anon_id}`)).toBe(2);
    });

    it('skips events for the wrong class, unknown students, bad shapes and stolen ids', async () => {
      const good = ev(student, 'app_open');
      const wrongClass = { ...ev(student, 'app_open'), class_id: otherCls.id };
      const unknown = { ...ev(student, 'app_open'), anon_id: randomUUID() };
      const badType = { ...ev(student, 'app_open'), type: 'hack' };
      const badTs = { ...ev(student, 'app_open'), client_ts: 'not-a-date' };
      const badPayload = { ...ev(student, 'app_open'), payload: [1, 2] };
      const badId = { ...ev(student, 'app_open'), event_id: 'not-a-uuid' };
      // Every skipped event is listed by the id it was sent with; items without one cannot be.
      expect(await push([good, wrongClass, unknown, badType, badTs, badPayload, badId, { nope: true }, 'x'])).toEqual({
        accepted: 1,
        rejected: [wrongClass, unknown, badType, badTs, badPayload, badId].map((e) => e.event_id),
      });
      // Another student re-using an id that is already held is not accepted.
      expect(await push([{ ...ev(other, 'app_open'), event_id: good.event_id }])).toEqual({
        accepted: 0,
        rejected: [good.event_id],
      });
    });

    it('keeps only allow-listed payload keys with short id-like values, and caps payload size', async () => {
      const e = ev(student, 'decision_made', {
        scenarioId: 'budget.bus.01',
        choiceId: 'b',
        pillar: 'plan_budget',
        month: 1,
        week: 2,
        note: 'my real name is Asha',
        nested: { a: 1 },
        choiceIdExtra: 'x',
      });
      const freeText = ev(student, 'badge_earned', { badgeId: 'call me on 98765 43210' });
      expect(await push([e, freeText])).toEqual({ accepted: 2, rejected: [] });
      const rows =
        await db.sql`select event_id, payload from events where event_id in ${db.sql([e.event_id, freeText.event_id])}`;
      const byId = Object.fromEntries(rows.map((r) => [r.event_id, r.payload]));
      expect(byId[e.event_id]).toEqual({
        scenarioId: 'budget.bus.01',
        choiceId: 'b',
        pillar: 'plan_budget',
        month: 1,
        week: 2,
      });
      expect(byId[freeText.event_id]).toEqual({});

      const big = ev(student, 'app_open', { padding: 'a'.repeat(3000) });
      expect(await push([big])).toEqual({ accepted: 0, rejected: [big.event_id] });
    });

    it('clamps a future device time so it cannot pin last_active', async () => {
      const future = await join(cls.class_code, 'Future Kid');
      expect(await push([ev(future, 'app_open', {}, '2099-01-01T00:00:00Z')])).toEqual({ accepted: 1, rejected: [] });
      const [s] =
        await db.sql`select last_active, now() + interval '5 minutes' as cap from students where anon_id = ${future.anon_id}`;
      expect(s!.last_active.getTime()).toBeLessThanOrEqual(s!.cap.getTime());
      const rows = (await db.asUser(
        facilitator,
        (tx) => tx`select * from class_progress(${cls.id})`,
      )) as ClassProgressRow[];
      const row = rows.find((r) => r.nickname === 'Future Kid')!;
      expect(new Date(row.last_active!).getTime()).toBeLessThan(Date.now() + 10 * 60 * 1000);
    });

    it('records the first quiz attempt per type at server time, and applies language and level changes', async () => {
      const answers: QuizAnswer[] = [
        { questionId: 'q1', pillar: 'stay_safe', choice: 1, correct: true },
        { questionId: 'q2', pillar: 'plan_budget', choice: 0, correct: false },
      ];
      const quiz = ev(student, 'quiz_submitted', { quiz_type: 'baseline', answers, score: 50 }, '2020-01-01T00:00:00Z');
      await push([
        quiz,
        ev(student, 'language_changed', { lang: 'en' }),
        ev(student, 'onboarding_complete', { level: 'explorer' }),
      ]);
      await push([quiz]);
      // A retake is stored as an event and accepted, but the first attempt counts.
      const retake = ev(student, 'quiz_submitted', {
        quiz_type: 'baseline',
        score: 100,
        answers: answers.map((a) => ({ ...a, correct: true })),
      });
      expect(await push([retake])).toEqual({ accepted: 1, rejected: [] });

      const attempts =
        await db.sql`select quiz_type, score, answers, created_at from quiz_attempts where anon_id = ${student.anon_id}`;
      expect(attempts.map(({ created_at: _c, ...rest }) => rest)).toEqual([
        { quiz_type: 'baseline', score: 50, answers },
      ]);
      // Server time, not the device's 2020 timestamp.
      expect(attempts[0]!.created_at.getTime()).toBeGreaterThan(Date.now() - 24 * 3600 * 1000);
      const [s] = await db.sql`select lang, level, last_active from students where anon_id = ${student.anon_id}`;
      expect(s).toMatchObject({ lang: 'en', level: 'explorer' });
      expect(s!.last_active).toBeInstanceOf(Date);
      await expect(
        db.sql`insert into quiz_attempts (anon_id, quiz_type, answers, score) values (${student.anon_id}, 'baseline', '[]', 0)`,
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('rejects malformed quiz payloads without storing them', async () => {
      const ok = { questionId: 'q1', pillar: 'stay_safe', choice: 0, correct: true };
      const bad = [
        { quiz_type: 'endline', score: 50, answers: [{ ...ok, correct: 'yes' }] },
        { quiz_type: 'endline', score: 50, answers: [{ ...ok, pillar: 'crypto' }] },
        { quiz_type: 'endline', score: 50, answers: [{ ...ok, choice: '0' }] },
        { quiz_type: 'endline', score: 50, answers: ['q1'] },
        { quiz_type: 'endline', score: 50, answers: [] },
        { quiz_type: 'endline', score: 50, answers: Array.from({ length: 25 }, () => ok) },
        { quiz_type: 'endline', score: 50, answers: { 0: ok } },
        { quiz_type: 'endline', score: 150, answers: [ok] },
        { quiz_type: 'endline', score: '50', answers: [ok] },
        { quiz_type: 'midline', score: 50, answers: [ok] },
      ];
      const events = bad.map((p) => ev(student, 'quiz_submitted', p));
      expect(await push(events)).toEqual({ accepted: 0, rejected: events.map((e) => e.event_id) });
      expect(
        await count(
          db.sql`select count(*)::int as n from events where event_id in ${db.sql(events.map((e) => e.event_id))}`,
        ),
      ).toBe(0);
      expect(
        await count(
          db.sql`select count(*)::int as n from quiz_attempts where anon_id = ${student.anon_id} and quiz_type = 'endline'`,
        ),
      ).toBe(0);
    });

    it('accepts classroom quiz results as events, keeps quiz_id, and never makes them quiz attempts', async () => {
      const answers: QuizAnswer[] = [
        { questionId: 'quiz.classroom.save.q1', pillar: 'save_manage', choice: 2, correct: true },
      ];
      const first = ev(student, 'quiz_submitted', {
        quiz_type: 'classroom',
        quiz_id: 'classroom',
        answers,
        score: 100,
      });
      const again = ev(student, 'quiz_submitted', { quiz_type: 'classroom', quiz_id: 'classroom', answers, score: 0 });
      // Both count as accepted, so the client sync queue never sees a partial batch.
      expect(await push([first, again])).toEqual({ accepted: 2, rejected: [] });
      const stored =
        await db.sql`select payload from events where event_id in ${db.sql([first.event_id, again.event_id])}`;
      expect(stored).toHaveLength(2);
      expect(stored.map((r) => r.payload.quiz_id)).toEqual(['classroom', 'classroom']);
      expect(
        await count(
          db.sql`select count(*)::int as n from quiz_attempts where anon_id = ${student.anon_id} and quiz_type = 'classroom'`,
        ),
      ).toBe(0);
    });

    it('accepts the map and news events with exactly their 5.5 payload keys and values', async () => {
      // Each payload also carries a key from another type, a camelCase spelling and a free-text value.
      const events = [
        ev(student, 'map_opened', { location_id: 'home' }),
        ev(student, 'location_selected', { location_id: 'convenience.phone_shop', locationId: 'bank' }),
        ev(student, 'week_slept', { month: 2, week: 4, edition: '2026-W41' }),
        ev(student, 'glossary_term_opened', { term_id: 'inflation', article_id: 'upi_fraud', termId: 'x' }),
        ev(student, 'news_question_answered', {
          edition: '2026-W41',
          article_id: 'upi_fraud',
          correct: false,
          attempt: 2,
          answer: 'I think it is the bank',
        }),
        ev(student, 'news_edition_completed', { edition: '2026-W41', correct_count: 4, score: 80 }),
        ev(student, 'glossary_term_opened', { term_id: 'call 98765 43210', article_id: 'upi_fraud' }),
      ];
      expect(await push(events)).toEqual({ accepted: events.length, rejected: [] });
      const rows = await db.sql`select event_id, type, payload from events where event_id in ${db.sql(
        events.map((e) => e.event_id),
      )}`;
      const byId = Object.fromEntries(rows.map((r) => [r.event_id, r]));
      expect(events.map((e) => [byId[e.event_id]!.type, byId[e.event_id]!.payload])).toEqual([
        ['map_opened', {}],
        ['location_selected', { location_id: 'convenience.phone_shop' }],
        ['week_slept', { month: 2, week: 4 }],
        ['glossary_term_opened', { term_id: 'inflation', article_id: 'upi_fraud' }],
        ['news_question_answered', { edition: '2026-W41', article_id: 'upi_fraud', correct: false, attempt: 2 }],
        ['news_edition_completed', { edition: '2026-W41', correct_count: 4 }],
        ['glossary_term_opened', { article_id: 'upi_fraud' }],
      ]);
    });

    it('rejects only the bad events of a mixed batch and keeps the good ones', async () => {
      const good = [ev(student, 'app_open'), ev(student, 'badge_earned', { badgeId: 'first_save' })];
      const bad = { ...ev(student, 'app_open'), type: 'hack' };
      expect(await push([good[0], bad, good[1]])).toEqual({ accepted: 2, rejected: [bad.event_id] });
      expect(
        await count(
          db.sql`select count(*)::int as n from events where event_id in ${db.sql(good.map((e) => e.event_id))}`,
        ),
      ).toBe(2);
    });

    it('rejects an event that breaks a table constraint instead of failing the whole batch', async () => {
      // As if a type had payload keys but were missing from the events CHECK: the insert raises.
      const [{ def }] = (await db.sql`
        select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'events_type_check'`) as [
        { def: string },
      ];
      await db.sql`alter table events drop constraint events_type_check`;
      await db.sql`alter table events add constraint events_type_check check (type <> 'badge_earned') not valid`;
      try {
        const good = ev(student, 'app_open');
        const breaks = ev(student, 'badge_earned', { badgeId: 'x' });
        expect(await push([good, breaks])).toEqual({ accepted: 1, rejected: [breaks.event_id] });
        expect(await count(db.sql`select count(*)::int as n from events where event_id = ${breaks.event_id}`)).toBe(0);
      } finally {
        await db.sql`alter table events drop constraint events_type_check`;
        await db.sql.unsafe(`alter table events add constraint events_type_check ${def}`);
      }
    });

    it('caps a batch at 500 events', async () => {
      const many = Array.from({ length: 501 }, () => ev(student, 'app_open'));
      await expect(push(many)).rejects.toMatchObject({ code: 'PT413' });
    });
  });

  describe('class_progress and learning_gain', () => {
    let a: JoinClassResult;
    let b: JoinClassResult;
    beforeAll(async () => {
      a = await join(cls.class_code, 'Asha');
      b = await join(cls.class_code, 'Bilal');
      const quiz = (s: JoinClassResult, quiz_type: string, correct: boolean[]) =>
        ev(s, 'quiz_submitted', {
          quiz_type,
          score: Math.round((100 * correct.filter(Boolean).length) / correct.length),
          answers: correct.map((c, i) => ({
            questionId: `q${i}`,
            pillar: i < 2 ? 'stay_safe' : 'plan_budget',
            choice: 0,
            correct: c,
          })),
        });
      const at = (min: number) => `2026-10-01T10:${String(min).padStart(2, '0')}:00Z`;
      await push([
        ev(a, 'decision_made', { scenarioId: 'safe.otp.01', choiceId: 'a', pillar: 'stay_safe' }),
        ev(a, 'decision_made', { scenarioId: 'safe.upi.01', choiceId: 'a', pillar: 'stay_safe' }),
        ev(a, 'decision_made', { scenarioId: 'budget.bus.01', choiceId: 'b', pillar: 'plan_budget' }),
        ev(a, 'module_complete', { pillar: 'stay_safe' }),
        ev(a, 'module_complete', { pillar: 'stay_safe' }), // re-sent with a new id: still one module
        quiz(a, 'baseline', [true, false, false, false]),
        quiz(a, 'endline', [true, true, true, false]),
        quiz(b, 'baseline', [false, false, true, false]),
        // Bilal: week 1 decided, rewound and re-decided; week 2 decided then rewound.
        ev(
          b,
          'decision_made',
          { scenarioId: 'save.a', choiceId: 'a', pillar: 'save_manage', month: 1, week: 1 },
          at(1),
        ),
        ev(b, 'rewind_used', { scenarioId: 'save.a', month: 1, week: 1 }, at(2)),
        ev(
          b,
          'decision_made',
          { scenarioId: 'budget.b', choiceId: 'b', pillar: 'plan_budget', month: 1, week: 1 },
          at(3),
        ),
        ev(b, 'decision_made', { scenarioId: 'safe.c', choiceId: 'a', pillar: 'stay_safe', month: 1, week: 2 }, at(4)),
        ev(b, 'rewind_used', { scenarioId: 'safe.c', month: 1, week: 2 }, at(5)),
        ev(b, 'module_complete', { moduleId: 'm1', pillar: 'stay_safe' }),
        ev(b, 'module_complete', { moduleId: 'm1', pillar: 'stay_safe' }),
        ev(b, 'module_complete', { moduleId: 'm2' }),
      ]);
      // A stored attempt with a non-boolean `correct` (written before validation existed,
      // or by hand) must not break learning_gain: it counts as wrong.
      const [chai] =
        (await db.sql`select anon_id from students where class_id = ${cls.id} and nickname = 'Chai Star'`) as [
          { anon_id: string },
        ];
      await db.sql`
        insert into quiz_attempts (anon_id, quiz_type, answers, score) values
          (${chai.anon_id}, 'baseline', ${db.sql.json([{ questionId: 'q0', pillar: 'stay_safe', choice: 0, correct: 'yes' }])}, 0),
          (${chai.anon_id}, 'endline', ${db.sql.json([{ questionId: 'q0', pillar: 'stay_safe', choice: 0, correct: true }, 'junk'])}, 100)`;
    });

    const progress = (user: string, classId: string) =>
      db.asUser(user, (tx) => tx`select * from class_progress(${classId})`) as Promise<ClassProgressRow[]>;
    const gains = (user: string, classId: string) =>
      db.asUser(user, (tx) => tx`select * from learning_gain(${classId})`) as Promise<GainRow[]>;

    it('shows each student with modules, decisions per pillar and quiz scores', async () => {
      const rows = await progress(facilitator, cls.id);
      const asha = rows.find((r) => r.nickname === 'Asha')!;
      expect(asha).toMatchObject({
        modules_done: 1,
        decisions: 3,
        pillars: { plan_budget: 1, save_manage: 0, understand_investing: 0, stay_safe: 2 },
        baseline_score: 25,
        endline_score: 75,
        lang: 'hi',
      });
      expect(asha.last_active).toBeInstanceOf(Date);
    });

    it('counts one decision per weekly slot, drops rewound ones, and dedupes modules', async () => {
      const rows = await progress(facilitator, cls.id);
      expect(rows.find((r) => r.nickname === 'Bilal')).toMatchObject({
        decisions: 1,
        pillars: { plan_budget: 1, save_manage: 0, understand_investing: 0, stay_safe: 0 },
        modules_done: 2,
        baseline_score: 25,
        endline_score: null,
      });
    });

    it('counts weeks played and news editions completed, once each', async () => {
      const deepa = await join(cls.class_code, 'Deepa');
      await push([
        ev(deepa, 'week_slept', { month: 1, week: 1 }),
        ev(deepa, 'week_slept', { month: 1, week: 1 }), // re-sent with a new id: still one week
        ev(deepa, 'week_slept', { month: 1, week: 2 }),
        ev(deepa, 'week_slept', { month: 2, week: 1 }),
        ev(deepa, 'week_slept', {}), // no slot: not a week
        ev(deepa, 'news_edition_completed', { edition: '2026-W41', correct_count: 5 }),
        ev(deepa, 'news_edition_completed', { edition: '2026-W41', correct_count: 3 }),
        ev(deepa, 'news_edition_completed', { correct_count: 2 }), // no edition: not counted
      ]);
      const rows = await progress(facilitator, cls.id);
      expect(rows.find((r) => r.nickname === 'Deepa')).toMatchObject({
        weeks_played: 3,
        news_editions: 1,
        decisions: 0,
      });
      expect(rows.find((r) => r.nickname === 'Asha')).toMatchObject({ weeks_played: 0, news_editions: 0 });
    });

    it('is callable by facilitators only, after its return type changed', async () => {
      await expect(db.asAnon((tx) => tx`select * from class_progress(${cls.id})`)).rejects.toThrow(/permission denied/);
    });

    it('compares matched students only, by pillar, from each student’s first attempt', async () => {
      const rows = await gains(facilitator, cls.id);
      expect(rows.map((r) => r.pillar)).toEqual(['plan_budget', 'save_manage', 'understand_investing', 'stay_safe']);
      const safe = rows.find((r) => r.pillar === 'stay_safe')!;
      // Matched: Asha (baseline 1/2, end-line 2/2) and Chai Star (baseline 'yes' -> wrong, end-line 1/1).
      // Bilal and Offline One have no end-line, so they are left out.
      expect(Number(safe.baseline_avg)).toBe(25);
      expect(Number(safe.endline_avg)).toBe(100);
      expect([safe.baseline_n, safe.endline_n, safe.n]).toEqual([2, 2, 2]);
      const budget = rows.find((r) => r.pillar === 'plan_budget')!;
      expect([Number(budget.baseline_avg), Number(budget.endline_avg), budget.n]).toEqual([0, 50, 1]);
      expect(rows.find((r) => r.pillar === 'save_manage')).toMatchObject({
        baseline_avg: null,
        endline_avg: null,
        baseline_n: 0,
        n: 0,
      });
    });

    it('shows nothing of another facilitator’s class, and nothing to students', async () => {
      expect(await progress(otherFacilitator, cls.id)).toEqual([]);
      const theirs = await gains(otherFacilitator, cls.id);
      expect(theirs.every((r) => r.baseline_n === 0 && r.endline_n === 0 && r.n === 0)).toBe(true);
      await expect(db.asAnon((tx) => tx`select * from class_progress(${cls.id})`)).rejects.toThrow(/permission denied/);
    });

    it('lets a facilitator rename a student in their class only, through the same filter', async () => {
      const renamed = await db.asUser(
        facilitator,
        (tx) => tx`update students set nickname = ' Asha K ' where anon_id = ${a.anon_id} returning nickname`,
      );
      expect(renamed).toEqual([{ nickname: 'Asha K' }]);
      await expect(
        db.asUser(facilitator, (tx) => tx`update students set nickname = 'G4ndu' where anon_id = ${a.anon_id}`),
      ).rejects.toMatchObject({ code: 'PT422', message: 'nickname_blocked' });
      await expect(
        db.asUser(
          facilitator,
          (tx) => tx`update students set nickname = 'a much too long nickname here' where anon_id = ${a.anon_id}`,
        ),
      ).rejects.toMatchObject({ code: 'PT422', message: 'nickname_invalid' });
      const blocked = await db.asUser(
        otherFacilitator,
        (tx) => tx`update students set nickname = 'xy' where anon_id = ${a.anon_id} returning nickname`,
      );
      expect(blocked).toEqual([]);
      await expect(
        db.asUser(facilitator, (tx) => tx`update students set class_id = ${otherCls.id} where anon_id = ${a.anon_id}`),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
