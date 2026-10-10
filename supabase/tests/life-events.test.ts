import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SyncEventSchema, type JoinClassResult, type SyncEvent, type SyncEventType } from '@paisa/shared';
import { createTestDb, skipDbTests, type TestDb } from './db';

/**
 * One realistic payload per event type, with every key push_events keeps. Typed against
 * SyncEventType, so a new type fails the typecheck until it has a sample here.
 */
const SAMPLES: Record<SyncEventType, Record<string, unknown>> = {
  app_open: {},
  onboarding_complete: { level: 'explorer', lang: 'hi', personaId: 'sana', persona_id: 'sana' },
  persona_selected: { personaId: 'sana', persona_id: 'sana', level: 'explorer' },
  decision_made: { scenarioId: 'budget.recharge.01', choiceId: 'a', pillar: 'plan_budget', month: 1, week: 1 },
  rewind_used: { scenarioId: 'budget.recharge.01', month: 1, week: 1, tokensLeft: 2 },
  event_triggered: { eventId: 'scam.otp.01', choiceId: 'b', month: 1, week: 2 },
  minigame_complete: { game: 'scam_or_safe', correct: 4, total: 5, score: 80, level: 'starter' },
  quiz_submitted: {
    quiz_type: 'classroom',
    quiz_id: 'classroom',
    score: 100,
    answers: [{ questionId: 'quiz.classroom.safe.otp', pillar: 'stay_safe', choice: 1, correct: true }],
  },
  module_complete: { moduleId: 'plan_budget.1', pillar: 'plan_budget' },
  badge_earned: { badgeId: 'first_save' },
  language_changed: { lang: 'hi' },
  sync_complete: { count: 3 },
  map_opened: {},
  location_selected: { location_id: 'convenience.phone_shop' },
  week_slept: { month: 1, week: 1 },
  glossary_term_opened: { term_id: 'inflation', article_id: 'upi_fraud' },
  news_question_answered: { edition: '2026-W41', article_id: 'upi_fraud', correct: true, attempt: 1 },
  news_edition_completed: { edition: '2026-W41', correct_count: 5 },
  shop_purchase: { kind: 'want', price: 400, health: 0, sanity: 12, month: 1, week: 2 },
  work_shift: { wage: 300, health: -5, sanity: -3, month: 1, week: 2 },
  school_attended: { health: 0, sanity: -2, month: 1, week: 2 },
};

const TYPES = SyncEventSchema.shape.type.options;

// Skips locally when no test database is running; always runs in CI (see db.ts).
describe.skipIf(skipDbTests)('life events and the event type guard', () => {
  let db: TestDb;
  let student: JoinClassResult;

  beforeAll(async () => {
    db = await createTestDb();
    const facilitator = await db.createFacilitator();
    const [cls] = await db.asUser(
      facilitator,
      (tx) => tx`insert into classes (name, default_lang) values ('Class 11 C', 'en') returning class_code`,
    );
    student = await db.asAnon(
      async (tx) => (await tx`select join_class(${cls!.class_code}, 'Life Tester') as r`)[0]!.r as JoinClassResult,
    );
  });
  afterAll(() => db?.drop());

  const push = (events: unknown[]) =>
    db.asAnon(
      async (tx) =>
        (await tx`select push_events(${tx.json(events as never)}) as r`)[0]!.r as {
          accepted: number;
          rejected: string[];
        },
    );

  const ev = (type: string, payload: Record<string, unknown>): SyncEvent => ({
    event_id: randomUUID(),
    anon_id: student.anon_id,
    class_id: student.class_id,
    type: type as SyncEventType,
    payload,
    client_ts: '2026-10-11T10:00:00+05:30',
    content_version: '2026.10.11',
  });

  const stored = async (eventId: string) =>
    (await db.sql`select payload from events where event_id = ${eventId}`)[0]?.payload as
      Record<string, unknown> | undefined;

  it('accepts every SyncEvent type the shared schema lists, keeping each key it documents', async () => {
    for (const type of TYPES) {
      const e = ev(type, SAMPLES[type]);
      expect(await push([e]), type).toEqual({ accepted: 1, rejected: [] });
      expect(await stored(e.event_id), type).toEqual(SAMPLES[type]);
    }
  });

  it('keeps the events CHECK and event_payload_keys in step for every type', async () => {
    const [{ def }] = (await db.sql`
      select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'events_type_check'
    `) as unknown as [{ def: string }];
    const missingKeys = await db.sql`
      select t from unnest(${TYPES as unknown as string[]}::text[]) t where public.event_payload_keys(t) is null
    `;
    expect(missingKeys).toEqual([]);
    for (const type of TYPES) expect(def, type).toContain(`'${type}'`);
  });

  it('still rejects a type that is not in the list', async () => {
    const e = ev('free_money', {});
    expect(await push([e])).toEqual({ accepted: 0, rejected: [e.event_id] });
  });

  it('drops unknown keys and free text from life events, and keeps negative changes', async () => {
    const e = ev('shop_purchase', {
      kind: 'a want with spaces',
      price: 400,
      health: -3,
      sanity: 12,
      month: 1,
      week: 2,
      note: 'bought earphones',
    });
    expect(await push([e])).toEqual({ accepted: 1, rejected: [] });
    expect(await stored(e.event_id)).toEqual({ price: 400, health: -3, sanity: 12, month: 1, week: 2 });

    const shift = ev('work_shift', { wage: 300, health: -5, sanity: -3, month: 1, week: 3, bonus: 50 });
    const school = ev('school_attended', { health: 0, sanity: -2, month: 1, week: 3, subject: 'maths' });
    expect(await push([shift, school])).toEqual({ accepted: 2, rejected: [] });
    expect(await stored(shift.event_id)).toEqual({ wage: 300, health: -5, sanity: -3, month: 1, week: 3 });
    expect(await stored(school.event_id)).toEqual({ health: 0, sanity: -2, month: 1, week: 3 });
  });

  it('keeps persona_id as onboarding sends it, and still applies the level', async () => {
    const picked = ev('persona_selected', { persona_id: 'ravi', level: 'planner', avatar: 'kite' });
    const done = ev('onboarding_complete', { persona_id: 'ravi', lang: 'en' });
    expect(await push([picked, done])).toEqual({ accepted: 2, rejected: [] });
    expect(await stored(picked.event_id)).toEqual({ persona_id: 'ravi', level: 'planner' });
    expect(await stored(done.event_id)).toEqual({ persona_id: 'ravi', lang: 'en' });
    const [row] = await db.sql`select level from students where anon_id = ${student.anon_id}`;
    expect(row!.level).toBe('planner');
  });
});
