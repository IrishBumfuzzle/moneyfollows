import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  EventCardSchema,
  PersonaSchema,
  QuizQuestionSchema,
  ScamMessageSchema,
  ScenarioSchema,
  SyncEventSchema,
  type EventCard,
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
});
