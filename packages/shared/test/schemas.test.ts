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
    expect(PersonaSchema.safeParse({ ...persona, income: { ...persona.income, min: 6000, max: 6000 } }).success).toBe(true);
    expect(PersonaSchema.safeParse({ ...persona, income: { ...persona.income, min: 7000 } }).success).toBe(false);
  });

  it('requiresFlag uses the same pattern as flags', () => {
    const base = {
      id: 'x.a',
      pillar: 'plan_budget',
      concept: 'c',
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
      pending: [{ dueMonth: 2, dueWeek: 1, effects: { jars: { savings: 5 } }, note: 't:note.x', principal: { savings: 5 } }],
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
