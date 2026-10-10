import type { Choice, ContentBundle, EventCard, GameState, Persona, QuizQuestion, Scenario, TKey } from '@paisa/shared';

const meta = { status: 'reviewed', author: 'test' } as const;
const t = (s: string): TKey => `t:${s}`;

export function choice(id: string, effects: Choice['effects'] = {}, extra: Partial<Choice> = {}): Choice {
  return { id, label: t(`${id}.label`), effects, lesson: t(`lesson.${id}`), ...extra };
}

export function scenario(id: string, extra: Partial<Scenario> = {}): Scenario {
  return {
    id,
    pillar: 'plan_budget',
    concept: 'test',
    personas: ['sana', 'ravi'],
    difficulty: 1,
    text: t(`${id}.story`),
    choices: [choice('a', { jars: { wants: -100 } }), choice('b', { jars: { needs: -100 } })],
    meta,
    ...extra,
  };
}

export function event(id: string, extra: Partial<EventCard> = {}): EventCard {
  return {
    id,
    pillar: 'stay_safe',
    concept: 'test',
    personas: ['sana', 'ravi'],
    text: t(`${id}.story`),
    levels: ['starter', 'explorer', 'planner'],
    weight: 1,
    choices: [choice('a', { jars: { savings: -50 } }), choice('b')],
    meta,
    ...extra,
  };
}

export const sana: Persona = {
  id: 'sana',
  name: t('persona.sana.name'),
  bio: t('persona.sana.bio'),
  goal: { label: t('persona.sana.goal'), amount: 5000 },
  income: { pattern: 'steady', amount: 8000 },
  fixedCosts: 1000,
  startingJars: { needs: 500, wants: 200, goals: 0, savings: 300 },
  split: { needs: 50, wants: 20, goals: 10, savings: 20 },
  meta,
};

export const ravi: Persona = {
  id: 'ravi',
  name: t('persona.ravi.name'),
  bio: t('persona.ravi.bio'),
  goal: { label: t('persona.ravi.goal'), amount: 3000 },
  income: { pattern: 'irregular', min: 3000, max: 6000, step: 500 },
  fixedCosts: 500,
  startingJars: { needs: 300, wants: 100, goals: 0, savings: 100 },
  split: { needs: 55, wants: 15, goals: 10, savings: 20 },
  meta,
};

export const scenarios: Scenario[] = [
  scenario('budget.a'),
  scenario('budget.sana_only', { personas: ['sana'], difficulty: 2 }),
  scenario('budget.ravi_only', { personas: ['ravi'] }),
  scenario('save.a', {
    pillar: 'save_manage',
    choices: [choice('a', { jars: { savings: 200, wants: -200 } }), choice('b')],
  }),
  scenario('save.delayed', {
    pillar: 'save_manage',
    choices: [
      choice(
        'a',
        { jars: { wants: -100 } },
        {
          delayed: [{ afterWeeks: 6, effects: { jars: { savings: 500 } }, note: t('note.later') }],
        },
      ),
      choice('b'),
    ],
  }),
  scenario('flag.set', { choices: [choice('a', { debt: 200, flags: ['borrowed_friend'] }), choice('b')] }),
  scenario('flag.req', { pillar: 'save_manage', requiresFlag: 'borrowed_friend' }),
  scenario('invest.a', { pillar: 'understand_investing', assumption: true }),
  scenario('safe.hard', { pillar: 'stay_safe', difficulty: 3 }),
];

export const events: EventCard[] = [
  event('event.rain', { weight: 3 }),
  event('event.ok', { levels: ['explorer', 'planner'], choices: [choice('ok')] }),
];

export const quizzes: QuizQuestion[] = [
  ['q.b2', 'baseline', 'save_manage', 1],
  ['q.b1', 'baseline', 'plan_budget', 0],
  ['q.b3', 'baseline', 'plan_budget', 2],
  ['q.e1', 'endline', 'stay_safe', 0],
].map(([id, quiz, pillar, answer]) => ({
  id: id as string,
  quiz: quiz as QuizQuestion['quiz'],
  pillar: pillar as QuizQuestion['pillar'],
  concept: 'test',
  text: t(`${id}.text`),
  options: [t(`${id}.o0`), t(`${id}.o1`), t(`${id}.o2`)],
  answer: answer as number,
  explanation: t(`${id}.why`),
  meta,
}));

export const fixture: ContentBundle = {
  version: 'test',
  personas: [sana, ravi],
  scenarios,
  events,
  quizzes,
  scamMessages: [],
};

export function bundle(parts: Partial<ContentBundle>): ContentBundle {
  return { ...fixture, ...parts };
}

/** Recursively freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function withState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch };
}
