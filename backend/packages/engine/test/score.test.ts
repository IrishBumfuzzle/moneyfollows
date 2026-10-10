import { describe, expect, it } from 'vitest';
import { MonthReport, type GameState } from '@paisa/contracts';
import { EngineError, monthReport } from '../src';
import { pickReflection } from '../src/lesson';
import { content, quiet, variant } from './fixtures';
import { start } from './helpers';

const base = start(quiet, 'sana', 2).state;

function at(patch: Partial<GameState>): GameState {
  return { ...base, ...patch };
}

describe('Money Health Score', () => {
  it('matches a hand-computed score', () => {
    // sana: income 4000, needs split 50% and fixed costs 1200, so a month of needs is 3200.
    const s = at({
      jars: { needs: 100, wants: 100, goals: 2200, savings: 1100 },
      debt: 400,
      monthStart: { jars: { needs: 0, wants: 0, goals: 1000, savings: 300 }, debt: 0, income: 4000 },
    });
    const r = monthReport(s, content);
    // saved = 3300 - 1300 = 2000 -> 2000/4000/0.2 = 2.5 -> 1
    // emergency = 1100/3200; goal = 2200/15000; debtFree = 1 - 400/4000 = 0.9
    expect(r.parts.savingsRate).toBe(1);
    expect(r.parts.emergencyFund).toBeCloseTo(0.34375, 10);
    expect(r.parts.goalProgress).toBeCloseTo(2200 / 15000, 10);
    expect(r.parts.debtFree).toBeCloseTo(0.9, 10);
    // 100 * (0.3 + 0.3*0.34375 + 0.25*0.146667 + 0.15*0.9) = 57.48
    expect(r.score).toBe(57);
    expect(r.saved).toBe(2000);
    expect(r.income).toBe(4000);
    expect(MonthReport.safeParse(r).success).toBe(true);
  });

  it('is 100 when everything is maxed and 0 when nothing is saved but debt is a month of income', () => {
    const rich = at({
      jars: { needs: 0, wants: 0, goals: 15000, savings: 3200 },
      monthStart: { jars: { needs: 0, wants: 0, goals: 0, savings: 0 }, debt: 0, income: 4000 },
    });
    expect(monthReport(rich, content).score).toBe(100);
    const broke = at({
      jars: { needs: 0, wants: 0, goals: 0, savings: 0 },
      debt: 9000,
      monthStart: { jars: { needs: 0, wants: 0, goals: 0, savings: 0 }, debt: 0, income: 4000 },
    });
    const r = monthReport(broke, content);
    expect(r.score).toBe(0);
    expect(r.parts).toEqual({ savingsRate: 0, emergencyFund: 0, goalProgress: 0, debtFree: 0 });
  });

  it('clips a negative savings change at zero and handles zero income', () => {
    const drained = at({
      jars: { needs: 0, wants: 0, goals: 0, savings: 0 },
      monthStart: { jars: { needs: 0, wants: 0, goals: 500, savings: 500 }, debt: 0, income: 4000 },
    });
    const r = monthReport(drained, content);
    expect(r.parts.savingsRate).toBe(0);
    expect(r.saved).toBe(-1000);
    const noIncome = at({ monthStart: { ...base.monthStart, income: 0 } });
    expect(monthReport(noIncome, content).parts.savingsRate).toBe(0);
  });

  it('uses the weights from the content pack', () => {
    const c = variant((x) => {
      x.tuning.score.weights = { savingsRate: 1, emergencyFund: 0, goalProgress: 0, debt: 0 };
    });
    const s = at({
      jars: { needs: 0, wants: 0, goals: 1000, savings: 300 },
      monthStart: { jars: { needs: 0, wants: 0, goals: 1000, savings: 300 }, debt: 0, income: 4000 },
    });
    expect(monthReport(s, c).score).toBe(0);
    const s2 = at({ ...s, jars: { needs: 0, wants: 0, goals: 1400, savings: 300 } });
    // saved 400 -> 0.1/0.2 = 0.5 -> 50
    expect(monthReport(s2, c).score).toBe(50);
  });
});

describe('lesson engine: month-end reflection', () => {
  const risky = (pillar: GameState['decisions'][number]['pillar'], month = 1) => ({
    month,
    week: 1,
    cardId: 'x.01',
    cardKind: 'decision' as const,
    pillar,
    concept: 'c',
    choiceId: 'a',
    rating: 'risky' as const,
  });

  it('asks about the pillar with the most risky picks this month', () => {
    expect(pickReflection(at({ decisions: [risky('stay_safe')] }), content).id).toBe('reflect.stay_safe.01');
  });

  it('falls back to the general question with no risky picks, or a pillar that has none', () => {
    expect(pickReflection(at({ decisions: [] }), content).id).toBe('reflect.general.01');
    expect(pickReflection(at({ decisions: [risky('plan_budget')] }), content).id).toBe('reflect.general.01');
  });

  it('ignores risky picks from other months and breaks ties by pillar order', () => {
    expect(pickReflection(at({ month: 2, decisions: [risky('stay_safe', 1)] }), content).id).toBe('reflect.general.01');
    const c = variant((x) => {
      x.reflections.push({ id: 'reflect.budget.01', pillar: 'plan_budget', question: 't:q', options: ['t:a', 't:b'] });
    });
    const tie = at({ decisions: [risky('stay_safe'), risky('plan_budget')] });
    expect(pickReflection(tie, c).id).toBe('reflect.budget.01');
  });

  it('uses the first reflection when none is general, and throws when there are none', () => {
    const onlyPillar = variant((x) => {
      x.reflections = x.reflections.filter((r) => r.pillar === 'stay_safe');
    });
    expect(pickReflection(at({ decisions: [] }), onlyPillar).id).toBe('reflect.stay_safe.01');
    const none = variant((x) => {
      x.reflections = [];
    });
    expect(() => monthReport(base, none)).toThrowError(EngineError);
  });
});
