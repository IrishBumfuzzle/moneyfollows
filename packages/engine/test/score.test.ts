import { describe, expect, it } from 'vitest';
import { GAME_MONTHS, REFLECTION_KEYS } from '@paisa/shared';
import type { GameState } from '@paisa/shared';
import { choose, createGame, monthReport, projectGrowth, quizFor, scoreQuiz, shuffleOptions } from '../src';
import { bundle, choice, deepFreeze, fixture, scenario } from './fixtures';
import { always, play } from './helpers';

const noEvents = bundle({ events: [] });

// income 10000, so s = saved / 2000, e = savings / 1000, g = goals / 1000, d = debt / 10000.
function state(p: { s: number; e: number; g: number; d: number }): GameState {
  const savings = Math.round(p.e * 1000);
  const goals = Math.round(p.g * 1000);
  return {
    version: 1,
    personaId: 'sana',
    level: 'starter',
    seed: 1,
    month: 1,
    week: 4,
    jars: { needs: 0, wants: 0, goals, savings },
    debt: Math.round(p.d * 10000),
    goal: { amount: 1000, progress: goals },
    flags: [],
    seen: [],
    pending: [],
    rewindTokens: 3,
    history: [],
    earned: [],
    monthStart: {
      jars: { needs: 0, wants: 0, goals: 0, savings: savings + goals - Math.round(p.s * 2000) },
      debt: 0,
      income: 10000,
      needsBudget: 1000,
    },
  };
}

describe('monthReport', () => {
  it('matches a hand-computed score', () => {
    // saved 1500 of 5000 income: s clips to 1. e = 2000/3000, g = 1000/5000, d = 1000/5000.
    const s: GameState = {
      ...state({ s: 0, e: 0, g: 0, d: 0 }),
      jars: { needs: 0, wants: 0, goals: 1000, savings: 2000 },
      goal: { amount: 5000, progress: 1000 },
      debt: 1000,
      monthStart: { jars: { needs: 0, wants: 0, goals: 500, savings: 1000 }, debt: 0, income: 5000, needsBudget: 3000 },
    };
    const r = monthReport(s);
    expect(r.parts.s).toBe(1);
    expect(r.parts.e).toBeCloseTo(2 / 3);
    expect(r.parts.g).toBeCloseTo(0.2);
    expect(r.parts.d).toBeCloseTo(0.2);
    expect(r.score).toBe(67); // 100 * (0.30 + 0.20 + 0.05 + 0.12)
    expect(r.reflection).toBe(REFLECTION_KEYS.g);
  });

  it('is 100 and "great" when everything is maxed', () => {
    const r = monthReport(state({ s: 1, e: 1, g: 1, d: 0 }));
    expect(r.score).toBe(100);
    expect(r.reflection).toBe(REFLECTION_KEYS.great);
  });

  it('is "great" at 80 even if one part is weak', () => {
    const r = monthReport(state({ s: 1, e: 1, g: 1, d: 1 })); // 85
    expect(r.score).toBe(85);
    expect(r.reflection).toBe(REFLECTION_KEYS.great);
  });

  it.each([
    ['s', { s: 0.2, e: 0.9, g: 0.9, d: 0 }, 71],
    ['e', { s: 0.5, e: 0.4, g: 1, d: 0 }, 67],
    ['g', { s: 0.9, e: 0.9, g: 0.1, d: 0 }, 72],
    ['d', { s: 0.8, e: 0.8, g: 0.8, d: 0.9 }, 70],
  ] as const)('below 80, reflects on the weakest part (%s)', (key, parts, score) => {
    const r = monthReport(state(parts));
    expect(r.score).toBe(score);
    expect(r.reflection).toBe(REFLECTION_KEYS[key]);
  });

  it('clips terms to [0, 1] and treats a missing monthStart as zero income', () => {
    const { monthStart: _m, ...bare } = state({ s: 1, e: 5, g: 5, d: 9 });
    const r = monthReport(bare);
    expect(r.parts).toEqual({ s: 0, e: 1, g: 1, d: 1 });
    expect(r.score).toBe(Math.round(100 * (0.3 * 1 + 0.25 * 1)));
  });

  it('counts the payday split as saving: a fresh game has s > 0', () => {
    // sana: income 8000, payday puts 1600 in savings and 800 in goals = 30% of income
    const s0 = createGame('sana', 'starter', 1, noEvents);
    expect(monthReport(s0).parts.s).toBe(1);
    const thin = bundle({
      events: [],
      personas: [{ ...fixture.personas[0]!, split: { needs: 80, wants: 10, goals: 5, savings: 5 } }],
    });
    // 10% of income saved against the 20% target
    expect(monthReport(createGame('sana', 'starter', 1, thin)).parts.s).toBeCloseTo(0.5);
  });

  it('s is the net put into savings + goals over income: spending savings lowers it', () => {
    const c = bundle({
      events: [],
      scenarios: [scenario('spend', { choices: [choice('a', { jars: { savings: -800 } }), choice('b')] })],
    });
    const s0 = createGame('sana', 'starter', 1, c);
    const r = choose(s0, c, 'a').state; // 2400 - 800 = 1600 = 20% of 8000
    expect(monthReport(r).parts.s).toBeCloseTo(1);
    const r2 = choose(r, c, 'a').state; // 800 = 10%
    expect(monthReport(r2).parts.s).toBeCloseTo(0.5);
  });

  it('e uses one month of Needs as the persona split defines it (fixed costs not added twice)', () => {
    // savings 300 + 1600 = 1900; Needs share 50% of 8000 = 4000 (the 1000 fixed costs come out of it)
    const s0 = createGame('sana', 'starter', 1, noEvents);
    expect(s0.monthStart?.needsBudget).toBe(4000);
    expect(monthReport(s0).parts.e).toBeCloseTo(1900 / 4000);
  });

  it('does not penalise investing: in-flight principal still counts in s and e', () => {
    const payoff = (amount: number) => ({
      delayed: [{ afterWeeks: 6, effects: { jars: { savings: amount } }, note: 't:note.payoff' as const }],
    });
    const c = bundle({
      events: [],
      scenarios: [
        scenario('inv', {
          pillar: 'understand_investing',
          choices: [
            choice('a', { jars: { savings: -1000 } }, payoff(1100)),
            choice('b'),
            choice('loss', { jars: { savings: -1000 } }, payoff(400)),
          ],
        }),
      ],
    });
    const s0 = createGame('sana', 'explorer', 1, c);
    const invested = choose(s0, c, 'a').state;
    const kept = choose(s0, c, 'b').state;
    expect(invested.pending[0]?.principal).toEqual({ savings: 1000 });
    expect(monthReport(invested).parts).toEqual(monthReport(kept).parts);

    // a payoff smaller than the principal only shelters what comes back
    const lossy = choose(s0, c, 'loss').state;
    expect(lossy.pending[0]?.principal).toEqual({ savings: 400 });
    expect(monthReport(lossy).parts.e).toBeCloseTo((1900 - 600) / 4000);

    // month 2, when the payoff lands (abs week 7 = m2w3): s counts the 100 gain, not the returned principal
    const toMonth2 = (st: typeof s0, content = c) =>
      choose(play(st, content, always('b'), (x) => x.stage === 'monthEnd').state, content, 'continue').state;
    const m2 = toMonth2(invested);
    expect(m2.monthStart?.inFlight).toBe(1000);
    const landed = play(m2, c, always('b'), (x) => x.month === 2 && x.week === 4).state;
    expect(landed.pending).toEqual([]);
    const keptM2 = play(toMonth2(kept), c, always('b'), (x) => x.month === 2 && x.week === 4).state;
    expect(landed.jars.savings).toBe(keptM2.jars.savings + 100);
    const thinSplit = bundle({
      ...c,
      personas: [
        {
          ...fixture.personas[0]!,
          split: { needs: 90, wants: 5, goals: 0, savings: 5 },
          startingJars: { needs: 500, wants: 0, goals: 0, savings: 2000 },
        },
      ],
    });
    // with a 5% payday saving the gain is visible in s: (400 + 100) / 8000 / 0.2
    const t2 = play(toMonth2(choose(createGame('sana', 'explorer', 1, thinSplit), thinSplit, 'a').state, thinSplit), thinSplit, always('b'), (x) => x.month === 2 && x.week === 4).state;
    expect(t2.pending).toEqual([]);
    expect(monthReport(t2).parts.s).toBeCloseTo(500 / 8000 / 0.2);
  });

  it('a zero-income month: s is 0 and d uses the base income, not 1 for any debt', () => {
    const base = state({ s: 0, e: 0, g: 0, d: 0 });
    const zero: GameState = {
      ...base,
      debt: 1000,
      monthStart: { ...base.monthStart!, income: 0, baseIncome: 10000 },
    };
    const r = monthReport(zero);
    expect(r.parts.s).toBe(0);
    expect(r.parts.d).toBeCloseTo(0.1);
    // engine path: a seasonal month with multiplier 0
    const seasonal = bundle({
      events: [],
      personas: [
        {
          ...fixture.personas[0]!,
          income: { pattern: 'seasonal', amount: 8000, multipliers: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
        },
      ],
    });
    const g0 = createGame('sana', 'starter', 1, seasonal); // fixed costs 1000 with only 500 in Needs: borrows 500
    expect(g0.debt).toBe(500);
    expect(monthReport(g0).parts.d).toBeCloseTo(500 / 8000);
    expect(monthReport(g0).parts.s).toBe(0);
  });

  it('a played game gives scores in 0..100', () => {
    expect(GAME_MONTHS).toBe(3);
    const r = monthReport(state({ s: 0, e: 0, g: 0, d: 0 }));
    expect(r.score).toBe(15);
  });
});

describe('projectGrowth', () => {
  it('matches the future-value formula', () => {
    const p = projectGrowth(500, 10);
    expect(p.avg).toHaveLength(11);
    expect(p.avg[0]).toBe(0);
    expect(p.avg[10]).toBe(91473);
    expect(p.avg[1]).toBe(Math.round((500 * ((1 + 0.08 / 12) ** 12 - 1)) / (0.08 / 12)));
    for (let y = 1; y <= 10; y++) {
      expect(p.low[y]).toBeLessThan(p.avg[y]!);
      expect(p.avg[y]).toBeLessThan(p.high[y]!);
    }
  });

  it('handles a zero rate as plain saving', () => {
    const p = projectGrowth(500, 3, { low: 0, avg: 0, high: 0 });
    expect(p.low).toEqual([0, 6000, 12000, 18000]);
    expect(p.high).toEqual(p.low);
  });

  it('clamps bad inputs and always returns three equal-length series without -0', () => {
    const lengths = (p: ReturnType<typeof projectGrowth>) => [p.low.length, p.avg.length, p.high.length];
    expect(projectGrowth(-500, 2)).toEqual({ low: [0, 0, 0], avg: [0, 0, 0], high: [0, 0, 0] });
    expect(lengths(projectGrowth(500, -3))).toEqual([1, 1, 1]);
    expect(lengths(projectGrowth(500, Number.NaN))).toEqual([1, 1, 1]);
    expect(lengths(projectGrowth(500, 2.9))).toEqual([3, 3, 3]);
    expect(lengths(projectGrowth(500, Number.POSITIVE_INFINITY))).toEqual([101, 101, 101]);
    expect(projectGrowth(Number.NaN, 1).avg).toEqual([0, 0]);
    expect(projectGrowth(100.4, 1, { low: 0, avg: 0, high: 0 }).low).toEqual([0, 1200]);
    const neg = projectGrowth(0, 3, { low: -0.04, avg: 0, high: 0.04 });
    for (const v of [...neg.low, ...neg.avg, ...neg.high]) expect(Object.is(v, 0)).toBe(true);
    for (const v of projectGrowth(-0, 2).avg) expect(Object.is(v, 0)).toBe(true);
  });

  it('uses custom rates', () => {
    expect(projectGrowth(100, 1, { low: 0, avg: 0.12, high: 0.24 }).high[1]).toBe(
      Math.round((100 * (1.02 ** 12 - 1)) / 0.02),
    );
  });
});

describe('quizzes', () => {
  it('quizFor orders by pillar then id', () => {
    expect(quizFor(fixture, 'baseline').map((q) => q.id)).toEqual(['q.b1', 'q.b3', 'q.b2']);
    expect(quizFor(fixture, 'endline').map((q) => q.id)).toEqual(['q.e1']);
  });

  it('scoreQuiz rounds, counts unanswered as wrong and returns the stored answers', () => {
    const qs = quizFor(fixture, 'baseline'); // answers: b1=0, b3=2, b2=1
    const r = scoreQuiz(qs, { 'q.b1': 0, 'q.b3': 0, 'q.b2': 1 });
    expect(r).toMatchObject({ score: 67, correct: 2, total: 3 });
    expect(r.answers).toEqual([
      { questionId: 'q.b1', pillar: 'plan_budget', choice: 0, correct: true },
      { questionId: 'q.b3', pillar: 'plan_budget', choice: 0, correct: false },
      { questionId: 'q.b2', pillar: 'save_manage', choice: 1, correct: true },
    ]);
    const partial = scoreQuiz(qs, { 'q.b1': 0 });
    expect(partial).toMatchObject({ score: 33, correct: 1, total: 3 });
    expect(partial.answers).toHaveLength(1);
    expect(scoreQuiz(qs, {}).score).toBe(0);
    expect(scoreQuiz([], {}).score).toBe(0);
    expect(scoreQuiz(qs, { 'q.b1': 0, 'q.b3': 2, 'q.b2': 1 }).score).toBe(100);
  });

  it('shuffles options deterministically by seed and keeps the answer on the same option', () => {
    const content = deepFreeze(structuredClone(fixture));
    const plain = quizFor(content, 'baseline');
    expect(quizFor(content, 'baseline', 7)).toEqual(quizFor(content, 'baseline', 7));
    const positions = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const shuffled = quizFor(content, 'baseline', seed);
      shuffled.forEach((q, i) => {
        const orig = plain[i]!;
        expect(q.id).toBe(orig.id);
        expect([...q.options].sort()).toEqual([...orig.options].sort());
        expect(q.options[q.answer]).toBe(orig.options[orig.answer]);
        positions.add(q.answer);
      });
    }
    expect([...positions].sort()).toEqual([0, 1, 2]);
    // no seed: content order untouched
    expect(plain.map((q) => q.answer)).toEqual([0, 2, 1]);
    // scoring against the shuffled questions works
    const shuffled = quizFor(content, 'baseline', 3);
    const right = Object.fromEntries(shuffled.map((q) => [q.id, q.answer]));
    expect(scoreQuiz(shuffled, right).score).toBe(100);
    expect(shuffleOptions(plain[0]!, 3)).toEqual(shuffled[0]);
  });
});
