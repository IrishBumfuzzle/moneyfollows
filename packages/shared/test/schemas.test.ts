import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  DelayedEffectSchema,
  EventCardSchema,
  GameStateSchema,
  MAX_DELAY_WEEKS,
  SeedSchema,
  PersonaSchema,
  QuizQuestionSchema,
  ScamMessageSchema,
  ScenarioSchema,
  SyncEventSchema,
  ArticleSchema,
  GlossaryTermSchema,
  PlaceSchema,
  TKeySchema,
  type Article,
  type GlossaryTerm,
  type Place,
  type EventCard,
  type GameState,
  type Persona,
  type QuizQuestion,
  type ScamMessage,
  type Scenario,
  type SyncEvent,
} from '../src';

describe('schemas match the contract types', () => {
  it('produce values assignable to the types', () => {
    expectTypeOf<z.infer<typeof ScenarioSchema>>().toExtend<Scenario>();
    expectTypeOf<z.infer<typeof EventCardSchema>>().toExtend<EventCard>();
    expectTypeOf<z.infer<typeof PersonaSchema>>().toExtend<Persona>();
    expectTypeOf<z.infer<typeof QuizQuestionSchema>>().toExtend<QuizQuestion>();
    expectTypeOf<z.infer<typeof ScamMessageSchema>>().toExtend<ScamMessage>();
    expectTypeOf<z.infer<typeof SyncEventSchema>>().toExtend<SyncEvent>();
    expectTypeOf<z.infer<typeof GameStateSchema>>().toExtend<GameState>();
  });

  it('parses the CLAUDE.md scenario shape', () => {
    const scenario = {
      id: 'budget.recharge.01',
      pillar: 'plan_budget',
      concept: 'needs_vs_wants',
      location: 'convenience',
      sublocation: 'convenience.phone_shop',
      channel: 'in_person',
      speaker: 't:speaker.shopkeeper',
      personas: ['ravi', 'sana'],
      difficulty: 1,
      text: 't:budget.recharge.01.story',
      choices: [
        {
          id: 'a',
          label: 't:budget.recharge.01.a.label',
          effects: { jars: { needs: -199 } },
          lesson: 't:lesson.needs_first',
        },
        {
          id: 'b',
          label: 't:budget.recharge.01.b.label',
          effects: { jars: { needs: -199, wants: -599 } },
          delayed: [{ afterWeeks: 2, effects: { jars: { wants: -150 } }, note: 't:budget.recharge.01.b.later' }],
          lesson: 't:lesson.wants_cost',
        },
      ],
      meta: { status: 'draft', author: 'claude' },
    };
    expect(ScenarioSchema.parse(scenario).id).toBe('budget.recharge.01');
    expect(ScenarioSchema.safeParse({ ...scenario, choices: [scenario.choices[0]] }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, choices: [scenario.choices[0], scenario.choices[0]] }).success).toBe(
      false,
    );
    // 5.1: location, channel and speaker are required; a sublocation must belong to the location.
    const { location: _l, ...noLocation } = scenario;
    expect(ScenarioSchema.safeParse(noLocation).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, location: 'mall' }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, channel: 'letter' }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, sublocation: 'school.canteen' }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, location: 'home', sublocation: undefined }).success).toBe(true);
  });

  it('validates sync events', () => {
    const ok = {
      event_id: '6f1c2c1e-6b9e-4a7d-9a52-2f1b6b1a8f10',
      anon_id: '0b1d7c8e-1e7b-4d55-8f62-7d0c4a9f3e21',
      class_id: '5a2e9c3b-4f1d-4c8a-a6e2-1b9d8c7f6e54',
      type: 'decision_made',
      payload: { scenarioId: 'budget.recharge.01' },
      client_ts: '2026-10-10T10:00:00+05:30',
      content_version: '2026.10.10',
    };
    expect(SyncEventSchema.safeParse(ok).success).toBe(true);
    expect(SyncEventSchema.safeParse({ ...ok, type: 'hack' }).success).toBe(false);
  });

  const persona = {
    id: 'ravi',
    name: 't:persona.ravi.name',
    bio: 't:persona.ravi.bio',
    goal: { label: 't:persona.ravi.goal', amount: 3000 },
    income: { pattern: 'irregular', min: 3000, max: 6000, step: 500 },
    fixedCosts: 500,
    startingJars: { needs: 0, wants: 0, goals: 0, savings: 0 },
    split: { needs: 55, wants: 15, goals: 10, savings: 20 },
    meta: { status: 'draft', author: 'test' },
  };

  it('irregular income needs min <= max', () => {
    expect(PersonaSchema.safeParse(persona).success).toBe(true);
    expect(PersonaSchema.safeParse({ ...persona, income: { ...persona.income, min: 6000, max: 6000 } }).success).toBe(
      true,
    );
    expect(PersonaSchema.safeParse({ ...persona, income: { ...persona.income, min: 7000 } }).success).toBe(false);
  });

  it('requiresFlag uses the same pattern as flags', () => {
    const base = {
      id: 'x.a',
      pillar: 'plan_budget',
      concept: 'c',
      location: 'home',
      channel: 'phone',
      speaker: 't:speaker.friend',
      personas: ['ravi'],
      difficulty: 1,
      text: 't:x.a.story',
      choices: [
        { id: 'a', label: 't:x.a.a', effects: { flags: ['borrowed_friend'] }, lesson: 't:lesson.a' },
        { id: 'b', label: 't:x.a.b', effects: {}, lesson: 't:lesson.b' },
      ],
      meta: { status: 'draft', author: 'test' },
    };
    expect(ScenarioSchema.safeParse({ ...base, requiresFlag: 'borrowed_friend' }).success).toBe(true);
    for (const bad of ['Borrowed', 'borrowed friend', 'borrowed-friend', '']) {
      expect(ScenarioSchema.safeParse({ ...base, requiresFlag: bad }).success).toBe(false);
    }
  });

  it('caps afterWeeks at MAX_DELAY_WEEKS (11) so a delayed effect can land inside the game', () => {
    expect(MAX_DELAY_WEEKS).toBe(11);
    const d = { afterWeeks: 11, effects: {}, note: 't:note.later' };
    expect(DelayedEffectSchema.safeParse(d).success).toBe(true);
    expect(DelayedEffectSchema.safeParse({ ...d, afterWeeks: 12 }).success).toBe(false);
  });

  it('seeds are uint32 integers', () => {
    for (const ok of [0, 1, 2026, 2 ** 32 - 1]) expect(SeedSchema.safeParse(ok).success).toBe(true);
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) expect(SeedSchema.safeParse(bad).success).toBe(false);
  });

  it('GameStateSchema accepts a minimal v0 state and rejects broken ones', () => {
    const state = {
      version: 1,
      personaId: 'sana',
      level: 'starter',
      seed: 1,
      month: 1,
      week: 1,
      jars: { needs: 0, wants: 0, goals: 0, savings: 0 },
      debt: 0,
      goal: { amount: 1000, progress: 0 },
      flags: [],
      seen: [],
      pending: [
        { dueMonth: 2, dueWeek: 1, effects: { jars: { savings: 5 } }, note: 't:note.x', principal: { savings: 5 } },
      ],
      rewindTokens: 3,
      history: [{ anything: true }],
    };
    expect(GameStateSchema.safeParse(state).success).toBe(true);
    expect(GameStateSchema.safeParse({ ...state, version: 2 }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...state, debt: -1 }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...state, stage: 'nope' }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...state, extra: 1 }).success).toBe(false);
  });
});

describe('map and Paisa Times contracts (5.1, 5.5, 5.7)', () => {
  it('accepts edition keys like t:news.2026-W41.upi_fraud.headline', () => {
    expect(TKeySchema.safeParse('t:news.2026-W41.upi_fraud.headline').success).toBe(true);
    expect(TKeySchema.safeParse('t:glossary.inflation.simple').success).toBe(true);
    expect(TKeySchema.safeParse('t:News.x').success).toBe(false);
    expect(TKeySchema.safeParse('news.x').success).toBe(false);
  });

  it('parses an article and checks its question', () => {
    const article = {
      id: 'upi_fraud',
      edition: '2026-W41',
      headline: 't:news.2026-W41.upi_fraud.headline',
      body: 't:news.2026-W41.upi_fraud.body',
      terms: ['upi'],
      question: {
        prompt: 't:news.2026-W41.upi_fraud.q',
        options: ['t:news.2026-W41.upi_fraud.o1', 't:news.2026-W41.upi_fraud.o2'],
        correct: 1,
        explanation: 't:news.2026-W41.upi_fraud.why',
      },
      reward: { wage: 50, xp: 10 },
      meta: { status: 'draft', author: 'claude' },
    };
    expectTypeOf<z.infer<typeof ArticleSchema>>().toExtend<Article>();
    expect(ArticleSchema.parse(article).id).toBe('upi_fraud');
    expect(ArticleSchema.safeParse({ ...article, edition: '2026-41' }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...article, question: { ...article.question, correct: 2 } }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...article, meta: { ...article.meta, factsCheckedBy: 'Asha' } }).success).toBe(
      true,
    );
  });

  it('parses glossary terms and places, and checks sub-map parents', () => {
    expectTypeOf<z.infer<typeof GlossaryTermSchema>>().toExtend<GlossaryTerm>();
    expectTypeOf<z.infer<typeof PlaceSchema>>().toExtend<Place>();
    const term = {
      id: 'upi',
      word: 't:glossary.upi.word',
      simple: 't:glossary.upi.simple',
      example: 't:glossary.upi.example',
    };
    expect(GlossaryTermSchema.parse(term).id).toBe('upi');
    const shop = {
      id: 'convenience',
      name: 't:place.convenience',
      position: { x: 40, y: 60 },
      children: ['convenience.kirana'],
    };
    expect(PlaceSchema.safeParse(shop).success).toBe(true);
    const kirana = {
      id: 'convenience.kirana',
      name: 't:place.convenience.kirana',
      parent: 'convenience',
      position: { x: 10, y: 20 },
    };
    expect(PlaceSchema.safeParse(kirana).success).toBe(true);
    expect(PlaceSchema.safeParse({ ...kirana, parent: 'school' }).success).toBe(false);
    expect(PlaceSchema.safeParse({ ...kirana, parent: undefined }).success).toBe(false);
    expect(PlaceSchema.safeParse({ ...shop, parent: 'home' }).success).toBe(false);
    expect(PlaceSchema.safeParse({ ...shop, position: { x: 140, y: 0 } }).success).toBe(false);
  });

  it('loads old saves without earned as an empty list', () => {
    const save = GameStateSchema.parse({
      version: 1,
      personaId: 'sana',
      level: 'starter',
      seed: 1,
      month: 1,
      week: 1,
      jars: { needs: 0, wants: 0, goals: 0, savings: 0 },
      debt: 0,
      goal: { amount: 100, progress: 0 },
      flags: [],
      seen: [],
      pending: [],
      rewindTokens: 3,
      history: [],
    });
    expect(save.earned).toEqual([]);
  });

  it('accepts the classroom quiz and the six map and news event types', () => {
    const q = {
      id: 'quiz.classroom.save.q1',
      quiz: 'classroom',
      pillar: 'save_manage',
      concept: 'emergency_fund',
      text: 't:quiz.classroom.save.q1.q',
      options: ['t:quiz.classroom.save.q1.o1', 't:quiz.classroom.save.q1.o2'],
      answer: 0,
      explanation: 't:quiz.classroom.save.q1.why',
      meta: { status: 'draft', author: 'claude' },
    };
    expect(QuizQuestionSchema.safeParse(q).success).toBe(true);
    const base = {
      event_id: '11111111-1111-4111-8111-111111111111',
      anon_id: '22222222-2222-4222-8222-222222222222',
      class_id: '33333333-3333-4333-8333-333333333333',
      payload: {},
      client_ts: '2026-10-10T10:00:00+05:30',
      content_version: '2026.10.10.3',
    };
    for (const type of [
      'map_opened',
      'location_selected',
      'week_slept',
      'glossary_term_opened',
      'news_question_answered',
      'news_edition_completed',
      'shop_purchase',
      'work_shift',
      'school_attended',
      'guide_completed',
    ])
      expect(SyncEventSchema.safeParse({ ...base, type }).success, type).toBe(true);
  });
});
