import { describe, expect, it } from 'vitest';
import { GAME_MONTHS, REFLECTION_KEYS } from '@paisa/shared';
import type { GameState } from '@paisa/shared';
import { monthReport, projectGrowth, quizFor, scoreQuiz } from '../src';
import { fixture } from './fixtures';

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
});
