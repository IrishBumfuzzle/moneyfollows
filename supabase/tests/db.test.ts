import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClassProgressRow, JoinClassResult, LearningGainRow, QuizAnswer, SyncEvent } from '@paisa/shared';
import { createTestDb, type TestDb } from './db';

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
    async (tx) => (await tx`select push_events(${tx.json(events as never)}) as r`)[0]!.r as { accepted: number },
  );

const ev = (
  s: JoinClassResult,
  type: SyncEvent['type'],
  payload: Record<string, unknown> = {},
  ts = '2026-10-10T10:00:00+05:30',
): SyncEvent => ({
  event_id: randomUUID(),
  anon_id: s.anon_id,
  class_id: s.class_id,
  type,
  payload,
  client_ts: ts,
  content_version: '2026.10.10',
});

describe('classes', () => {
  it('get a readable code and the signed-in facilitator by default', async () => {
    expect(cls.class_code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
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
      db.asUser(facilitator, (tx) => tx`insert into classes (name, facilitator_id) values ('x', ${otherFacilitator})`),
    ).rejects.toThrow(/row-level security/);
  });

  it('are not readable by students', async () => {
    await expect(db.asAnon((tx) => tx`select * from classes`)).rejects.toThrow(/permission denied/);
    await expect(db.asAnon((tx) => tx`select * from students`)).rejects.toThrow(/permission denied/);
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
    await expect(join('ZZZZZZ', 'Asha')).rejects.toMatchObject({ code: 'PT404', message: 'class_not_found' });
    await expect(join(cls.class_code, 'chai star')).rejects.toMatchObject({ code: 'PT409', message: 'nickname_taken' });
    await expect(join(cls.class_code, 'G4ndu')).rejects.toMatchObject({ code: 'PT422', message: 'nickname_blocked' });
    await expect(join(cls.class_code, 'Asha 98765 43210')).rejects.toMatchObject({ message: 'nickname_personal_info' });
    await expect(join(cls.class_code, 'a@b.in')).rejects.toMatchObject({ message: 'nickname_personal_info' });
    await expect(join(cls.class_code, 'x')).rejects.toMatchObject({ message: 'nickname_invalid' });
    await expect(join(cls.class_code, '<script>')).rejects.toMatchObject({ message: 'nickname_invalid' });
  });

  it('allows the same nickname in a different class, and Hindi nicknames', async () => {
    await expect(join(otherCls.class_code, 'Chai Star')).resolves.toMatchObject({ default_lang: 'en' });
    await expect(join(cls.class_code, 'सितारा')).resolves.toMatchObject({ class_id: cls.id });
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
    expect(await push(batch)).toEqual({ accepted: 2 });
    expect(await push(batch)).toEqual({ accepted: 2 });
    const [{ n }] = (await db.sql`select count(*)::int as n from events where anon_id = ${student.anon_id}`) as [
      { n: number },
    ];
    expect(n).toBe(2);
  });

  it('skips events for the wrong class, unknown students, bad shapes and stolen ids', async () => {
    const good = ev(student, 'app_open');
    const wrongClass = { ...ev(student, 'app_open'), class_id: otherCls.id };
    const unknown = { ...ev(student, 'app_open'), anon_id: randomUUID() };
    const badType = { ...ev(student, 'app_open'), type: 'hack' };
    const badTs = { ...ev(student, 'app_open'), client_ts: 'not-a-date' };
    expect(await push([good, wrongClass, unknown, badType, badTs, { nope: true }])).toEqual({ accepted: 1 });
    // Another student re-using an id that is already held is not accepted.
    expect(await push([{ ...ev(other, 'app_open'), event_id: good.event_id }])).toEqual({ accepted: 0 });
  });

  it('records quiz attempts once, and applies language and level changes', async () => {
    const answers: QuizAnswer[] = [
      { questionId: 'q1', pillar: 'stay_safe', choice: 1, correct: true },
      { questionId: 'q2', pillar: 'plan_budget', choice: 0, correct: false },
    ];
    const quiz = ev(student, 'quiz_submitted', { quiz_type: 'baseline', answers, score: 50 });
    await push([
      quiz,
      ev(student, 'language_changed', { lang: 'en' }),
      ev(student, 'onboarding_complete', { level: 'explorer' }),
    ]);
    await push([quiz]);
    const attempts =
      await db.sql`select quiz_type, score, answers from quiz_attempts where anon_id = ${student.anon_id}`;
    expect(attempts).toEqual([{ quiz_type: 'baseline', score: 50, answers }]);
    const [s] = await db.sql`select lang, level, last_active from students where anon_id = ${student.anon_id}`;
    expect(s).toMatchObject({ lang: 'en', level: 'explorer' });
    expect(s!.last_active).toBeInstanceOf(Date);
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
    await push([
      ev(a, 'decision_made', { scenarioId: 'safe.otp.01', choiceId: 'a', pillar: 'stay_safe' }),
      ev(a, 'decision_made', { scenarioId: 'safe.upi.01', choiceId: 'a', pillar: 'stay_safe' }),
      ev(a, 'decision_made', { scenarioId: 'budget.bus.01', choiceId: 'b', pillar: 'plan_budget' }),
      ev(a, 'module_complete', { pillar: 'stay_safe' }),
      quiz(a, 'baseline', [true, false, false, false]),
      quiz(a, 'endline', [true, true, true, false]),
      quiz(b, 'baseline', [false, false, true, false]),
    ]);
  });

  const progress = (user: string, classId: string) =>
    db.asUser(user, (tx) => tx`select * from class_progress(${classId})`) as Promise<ClassProgressRow[]>;
  const gains = (user: string, classId: string) =>
    db.asUser(user, (tx) => tx`select * from learning_gain(${classId})`) as Promise<LearningGainRow[]>;

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
    expect(rows.find((r) => r.nickname === 'Bilal')).toMatchObject({ decisions: 0, endline_score: null });
  });

  it('averages percent correct by pillar from each student’s latest attempt', async () => {
    const rows = await gains(facilitator, cls.id);
    expect(rows.map((r) => r.pillar)).toEqual(['plan_budget', 'save_manage', 'understand_investing', 'stay_safe']);
    const safe = rows.find((r) => r.pillar === 'stay_safe')!;
    // Baseline: Asha 1/2, Bilal 0/2, and Offline One 1/1 from the push_events test -> 50%.
    // End-line: Asha 2/2 -> 100%.
    expect(Number(safe.baseline_avg)).toBe(50);
    expect(Number(safe.endline_avg)).toBe(100);
    expect([safe.baseline_n, safe.endline_n]).toEqual([3, 1]);
    expect(rows.find((r) => r.pillar === 'save_manage')).toMatchObject({
      baseline_avg: null,
      endline_avg: null,
      baseline_n: 0,
    });
  });

  it('shows nothing of another facilitator’s class, and nothing to students', async () => {
    expect(await progress(otherFacilitator, cls.id)).toEqual([]);
    const theirs = await gains(otherFacilitator, cls.id);
    expect(theirs.every((r) => r.baseline_n === 0 && r.endline_n === 0)).toBe(true);
    await expect(db.asAnon((tx) => tx`select * from class_progress(${cls.id})`)).rejects.toThrow(/permission denied/);
  });

  it('lets a facilitator rename a student in their class only', async () => {
    const renamed = await db.asUser(
      facilitator,
      (tx) => tx`update students set nickname = 'Asha K' where anon_id = ${a.anon_id} returning nickname`,
    );
    expect(renamed).toEqual([{ nickname: 'Asha K' }]);
    const blocked = await db.asUser(
      otherFacilitator,
      (tx) => tx`update students set nickname = 'x' where anon_id = ${a.anon_id} returning nickname`,
    );
    expect(blocked).toEqual([]);
    await expect(
      db.asUser(facilitator, (tx) => tx`update students set class_id = ${otherCls.id} where anon_id = ${a.anon_id}`),
    ).rejects.toThrow(/permission denied/);
  });
});
