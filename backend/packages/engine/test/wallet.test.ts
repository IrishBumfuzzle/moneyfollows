import { describe, expect, it } from 'vitest';
import { applyEffects } from '../src/wallet';
import { splitIncome, rollIncome } from '../src/income';
import { persona } from './fixtures';
import { deepFreeze } from './helpers';

const jars = deepFreeze({ needs: 500, wants: 200, goals: 1000, savings: 300 });

describe('wallet', () => {
  it('adds positive deltas and subtracts affordable ones', () => {
    const r = applyEffects(jars, 0, { needs: -199, savings: 50 });
    expect(r.jars).toEqual({ needs: 301, wants: 200, goals: 1000, savings: 350 });
    expect(r.debt).toBe(0);
    expect(r.applied).toEqual({ deltas: { needs: -199, savings: 50 }, debt: 0, borrowed: 0 });
  });

  it('never lets a jar go negative: the shortfall is borrowed', () => {
    const r = applyEffects(jars, 100, { wants: -500 });
    expect(r.jars.wants).toBe(0);
    expect(r.debt).toBe(400);
    expect(r.applied).toEqual({ deltas: { wants: -200 }, debt: 300, borrowed: 300 });
  });

  it('borrows the whole amount from an empty jar and reports no jar change', () => {
    const r = applyEffects({ ...jars, savings: 0 }, 0, { savings: -250 });
    expect(r.jars.savings).toBe(0);
    expect(r.applied).toEqual({ deltas: {}, debt: 250, borrowed: 250 });
  });

  it('adds a debt delta, and a loan does not touch the jars', () => {
    const r = applyEffects(jars, 0, {}, 2000);
    expect(r.jars).toEqual(jars);
    expect(r.debt).toBe(2000);
    expect(r.applied.debt).toBe(2000);
    expect(r.applied.borrowed).toBe(0);
  });

  it('caps a repayment at the debt owed but still takes the jar spend', () => {
    const r = applyEffects(jars, 300, { needs: -1200 }, -1000);
    // needs 500 pays 500, 700 borrowed: debt 300+700-1000 -> 0 (not -0)
    expect(r.debt).toBe(0);
    expect(r.jars.needs).toBe(0);
    expect(r.applied.borrowed).toBe(700);
    expect(r.applied.debt).toBe(-300);
    const small = applyEffects(jars, 100, { needs: -100 }, -500);
    expect(small.debt).toBe(0);
    expect(small.jars.needs).toBe(400);
    expect(small.applied.debt).toBe(-100);
  });

  it('does not mutate its inputs', () => {
    const before = JSON.stringify(jars);
    applyEffects(jars, 0, deepFreeze({ needs: -9999 }));
    expect(JSON.stringify(jars)).toBe(before);
  });
});

describe('income', () => {
  it('splits by percentage with floor and gives the remainder to needs', () => {
    expect(splitIncome(1001, { needs: 33, wants: 33, goals: 17, savings: 17 })).toEqual({
      needs: 331,
      wants: 330,
      goals: 170,
      savings: 170,
    });
    expect(splitIncome(4000, { needs: 50, wants: 20, goals: 20, savings: 10 })).toEqual({
      needs: 2000,
      wants: 800,
      goals: 800,
      savings: 400,
    });
  });

  it('always splits into whole rupees that add up to the income', () => {
    for (const income of [1, 7, 99, 1234, 2999, 3900]) {
      const s = splitIncome(income, { needs: 41, wants: 29, goals: 19, savings: 11 });
      expect(s.needs + s.wants + s.goals + s.savings).toBe(income);
      for (const v of Object.values(s)) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('applies seasonal multipliers by month and leaves the rng alone', () => {
    const ravi = persona('ravi');
    expect(rollIncome(ravi, 1, 7)).toEqual([3000, 7]);
    expect(rollIncome(ravi, 3, 7)).toEqual([3900, 7]);
    expect(rollIncome(ravi, 10, 7)).toEqual([4200, 7]);
    expect(rollIncome(ravi, 5, 7)).toEqual([2400, 7]);
  });

  it('steady income is the fixed amount', () => {
    expect(rollIncome(persona('sana'), 6, 5)).toEqual([4000, 5]);
  });

  it('irregular income stays in range on the step and consumes the rng', () => {
    const p = { ...persona('sana'), income: { pattern: 'irregular' as const, min: 1000, max: 2000, step: 250 } };
    const seen = new Set<number>();
    let rng = 1;
    for (let i = 0; i < 200; i++) {
      const [v, next] = rollIncome(p, 1, rng);
      expect(v).toBeGreaterThanOrEqual(1000);
      expect(v).toBeLessThanOrEqual(2000);
      expect(v % 250).toBe(0);
      expect(next).not.toBe(rng);
      seen.add(v);
      rng = next;
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1000, 1250, 1500, 1750, 2000]);
  });

  it('irregular income with no multiple of step in range falls back to min', () => {
    const p = { ...persona('sana'), income: { pattern: 'irregular' as const, min: 110, max: 140, step: 50 } };
    expect(rollIncome(p, 1, 3)[0]).toBe(110);
  });
});
