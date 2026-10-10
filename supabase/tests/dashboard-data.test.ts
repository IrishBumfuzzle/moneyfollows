import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JoinClassResult, QuizAnswer, SyncEvent } from '@paisa/shared';
import { createTestDb, skipDbTests, type TestDb } from './db';

const FUNCTIONS = ['classroom_quiz_summary', 'class_wellbeing', 'class_progress'] as const;

// Skips locally when no test database is running; always runs in CI (see db.ts).
describe.skipIf(skipDbTests)('dashboard data', () => {
  let db: TestDb;
  let facilitator: string;
  let otherFacilitator: string;
  let cls: { id: string; class_code: string };
  let otherCls: { id: string; class_code: string };
  let asha: JoinClassResult;
  let bilal: JoinClassResult;
  let chitra: JoinClassResult;
  let zoya: JoinClassResult;

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

  // Times are in the past on purpose: push_events clamps device times more than 5 minutes
  // ahead of the server, which would make the "latest persona" order a tie.
  const ev = (
    s: JoinClassResult,
    type: SyncEvent['type'],
    payload: Record<string, unknown> = {},
    ts = '2026-10-01T10:00:00+05:30',
  ): SyncEvent => ({
    event_id: randomUUID(),
    anon_id: s.anon_id,
    class_id: s.class_id,
    type,
    payload,
    client_ts: ts,
    content_version: '2026.10.11',
  });

  const answer = (questionId: string, pillar: QuizAnswer['pillar'], choice: number, correct: boolean): QuizAnswer => ({
    questionId,
    pillar,
    choice,
    correct,
  });
  const classroom = (s: JoinClassResult, score: number, answers: QuizAnswer[], quiz_type = 'classroom') =>
    ev(s, 'quiz_submitted', { quiz_type, quiz_id: 'classroom', score, answers });

  const call = (user: string, fn: (typeof FUNCTIONS)[number], classId: string) =>
    db.asUser(user, (tx) => tx`select * from ${tx(fn)}(${classId})`);

  beforeAll(async () => {
    db = await createTestDb();
    facilitator = await db.createFacilitator();
    otherFacilitator = await db.createFacilitator();
    [cls] = await db.asUser(
      facilitator,
      (tx) => tx`insert into classes (name, default_lang) values ('Class 11 D', 'hi') returning id, class_code`,
    );
    [otherCls] = await db.asUser(
      otherFacilitator,
      (tx) => tx`insert into classes (name, default_lang) values ('Class 12 E', 'en') returning id, class_code`,
    );
    asha = await join(cls.class_code, 'Asha');
    bilal = await join(cls.class_code, 'Bilal');
    chitra = await join(cls.class_code, 'Chitra'); // no events at all
    zoya = await join(otherCls.class_code, 'Zoya'); // another class: must never show up

    const events = [
      // Classroom rounds. q.plan: right, wrong(1), right, right. q.save: wrong(1), wrong(3), a tie.
      // q.safe: wrong(2), wrong(2), wrong(3).
      classroom(asha, 33, [
        answer('q.plan', 'plan_budget', 0, true),
        answer('q.safe', 'stay_safe', 2, false),
        answer('q.save', 'save_manage', 1, false),
      ]),
      classroom(asha, 0, [answer('q.plan', 'plan_budget', 1, false), answer('q.safe', 'stay_safe', 2, false)]),
      classroom(bilal, 33, [
        answer('q.plan', 'plan_budget', 0, true),
        answer('q.safe', 'stay_safe', 3, false),
        answer('q.save', 'save_manage', 3, false),
      ]),
      classroom(bilal, 100, [answer('q.plan', 'plan_budget', 0, true)]),
      // Not practice: a baseline test, and another class's round. Neither may count.
      classroom(asha, 0, [answer('q.plan', 'plan_budget', 3, false)], 'baseline'),
      classroom(zoya, 0, [answer('q.plan', 'plan_budget', 2, false)]),

      // Life events. Asha: 1 necessity, 2 wants (₹650); three malformed purchases skipped.
      ev(asha, 'shop_purchase', { kind: 'necessity', price: 120, health: 5, sanity: 0, month: 1, week: 1 }),
      ev(asha, 'shop_purchase', { kind: 'want', price: 400, health: 0, sanity: 12, month: 1, week: 1 }),
      ev(asha, 'shop_purchase', { kind: 'want', price: 250, health: 0, sanity: 8, month: 1, week: 2 }),
      ev(asha, 'shop_purchase', { kind: 'luxury', price: 999, month: 1, week: 2 }),
      ev(asha, 'shop_purchase', { kind: 'want', price: 99.5, month: 1, week: 2 }),
      ev(asha, 'shop_purchase', { kind: 'want', price: '400', month: 1, week: 2 }),
      // Work: week 1 twice (re-sent with a new id) and week 2: 2 weeks. School: week 1, plus one with no week.
      ev(asha, 'work_shift', { wage: 300, health: -5, sanity: -3, month: 1, week: 1 }),
      ev(asha, 'work_shift', { wage: 300, health: -5, sanity: -3, month: 1, week: 1 }),
      ev(asha, 'work_shift', { wage: 300, health: -5, sanity: -3, month: 1, week: 2 }),
      ev(asha, 'school_attended', { health: 0, sanity: -2, month: 1, week: 1 }),
      ev(asha, 'school_attended', { health: 0, sanity: -2 }),
      ev(bilal, 'shop_purchase', { kind: 'want', price: 100, health: 0, sanity: 4, month: 1, week: 1 }),
      // Daily clients send a day: Bilal works days 1 and 2 of week 1 (day 2 re-sent), goes to school
      // on day 1, and rests on days 1 and 2 (day 1 re-sent).
      ev(bilal, 'work_shift', { wage: 100, health: 0, sanity: -4, month: 1, week: 1, day: 1 }),
      ev(bilal, 'work_shift', { wage: 100, health: 0, sanity: -4, month: 1, week: 1, day: 2 }),
      ev(bilal, 'work_shift', { wage: 100, health: 0, sanity: -4, month: 1, week: 1, day: 2 }),
      ev(bilal, 'school_attended', { health: 0, sanity: -3, month: 1, week: 1, day: 1 }),
      ev(bilal, 'day_rested', { month: 1, week: 1, day: 1, health: 2, sanity: 6 }),
      ev(bilal, 'day_rested', { month: 1, week: 1, day: 1, health: 2, sanity: 6 }),
      ev(bilal, 'day_rested', { month: 1, week: 1, day: 2, health: 0, sanity: 6 }),
      ev(zoya, 'shop_purchase', { kind: 'want', price: 5000, month: 1, week: 1 }),

      // Personas. Asha picks sana, then ravi (older client spelling), then sends one with no persona.
      ev(asha, 'persona_selected', { persona_id: 'sana' }, '2026-10-01T09:00:00+05:30'),
      ev(asha, 'persona_selected', { personaId: 'ravi' }, '2026-10-01T09:30:00+05:30'),
      ev(asha, 'persona_selected', { level: 'starter' }, '2026-10-01T09:45:00+05:30'),
      ev(asha, 'onboarding_complete', { persona_id: 'sana' }, '2026-10-01T09:50:00+05:30'),
      // Bilal's event carries both spellings: persona_id wins.
      ev(bilal, 'persona_selected', { persona_id: 'sana', personaId: 'ravi' }),
    ];
    expect(await push(events)).toEqual({ accepted: events.length, rejected: [] });
  });
  afterAll(() => db?.drop());

  it('classroom_quiz_summary: one row per question, practice rounds of this class only', async () => {
    const rows = await call(facilitator, 'classroom_quiz_summary', cls.id);
    expect(rows.map((r) => ({ ...r, correct_pct: Number(r.correct_pct) }))).toEqual([
      { question_id: 'q.plan', pillar: 'plan_budget', attempts: 4, students: 2, correct_pct: 75, top_wrong_choice: 1 },
      // Wrong choices 1 and 3 tie: the lowest index wins.
      { question_id: 'q.save', pillar: 'save_manage', attempts: 2, students: 2, correct_pct: 0, top_wrong_choice: 1 },
      { question_id: 'q.safe', pillar: 'stay_safe', attempts: 3, students: 2, correct_pct: 0, top_wrong_choice: 2 },
    ]);
  });

  it('classroom_quiz_summary: top_wrong_choice is null when nobody got the question wrong', async () => {
    const [cls2] = await db.asUser(
      facilitator,
      (tx) => tx`insert into classes (name, default_lang) values ('Class 11 F', 'en') returning id, class_code`,
    );
    const dev = await join(cls2!.class_code, 'Dev');
    await push([classroom(dev, 100, [answer('q.plan', 'plan_budget', 0, true)])]);
    const [row] = await call(facilitator, 'classroom_quiz_summary', cls2!.id);
    expect({ ...row, correct_pct: Number(row!.correct_pct) }).toEqual({
      question_id: 'q.plan',
      pillar: 'plan_budget',
      attempts: 1,
      students: 1,
      correct_pct: 100,
      top_wrong_choice: null,
    });
  });

  it('class_wellbeing: purchases by kind, want spending, and days worked, at school or rested, per student', async () => {
    const rows = await call(facilitator, 'class_wellbeing', cls.id);
    expect(rows).toEqual([
      {
        anon_id: asha.anon_id,
        nickname: 'Asha',
        necessity_purchases: 1,
        want_purchases: 2,
        want_spend: 650,
        // Older events without a day count per week.
        work_shifts: 2,
        school_days: 2,
        rest_days: 0,
      },
      {
        anon_id: bilal.anon_id,
        nickname: 'Bilal',
        necessity_purchases: 0,
        want_purchases: 1,
        want_spend: 100,
        work_shifts: 2,
        school_days: 1,
        rest_days: 2,
      },
      {
        anon_id: chitra.anon_id,
        nickname: 'Chitra',
        necessity_purchases: 0,
        want_purchases: 0,
        want_spend: 0,
        work_shifts: 0,
        school_days: 0,
        rest_days: 0,
      },
    ]);
  });

  it('class_progress: persona and classroom_best are appended after the existing columns', async () => {
    const rows = await call(facilitator, 'class_progress', cls.id);
    expect(Object.keys(rows[0]!)).toEqual([
      'anon_id',
      'nickname',
      'modules_done',
      'last_active',
      'lang',
      'decisions',
      'pillars',
      'baseline_score',
      'endline_score',
      'weeks_played',
      'news_editions',
      'persona',
      'classroom_best',
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.nickname, r]));
    // The latest persona_selected that names one, persona_id before personaId; onboarding_complete is ignored.
    expect([by.Asha!.persona, by.Bilal!.persona, by.Chitra!.persona]).toEqual(['ravi', 'sana', null]);
    // Best classroom score; Asha's 0 baseline and other classes' rounds don't count.
    expect([by.Asha!.classroom_best, by.Bilal!.classroom_best, by.Chitra!.classroom_best]).toEqual([33, 100, null]);
    // Existing columns are unchanged: Asha's baseline still lands as a quiz attempt.
    expect(by.Asha).toMatchObject({ baseline_score: 0, endline_score: null, decisions: 0, weeks_played: 0 });
  });

  it('shows nothing of another facilitator’s class', async () => {
    for (const fn of FUNCTIONS) {
      expect(await call(otherFacilitator, fn, cls.id), fn).toEqual([]);
      expect(await call(facilitator, fn, otherCls.id), fn).toEqual([]);
    }
  });

  it('cannot be run by students (anon)', async () => {
    for (const fn of FUNCTIONS) {
      await expect(
        db.asAnon((tx) => tx`select * from ${tx(fn)}(${cls.id})`),
        fn,
      ).rejects.toThrow(/permission denied/);
    }
  });
});
