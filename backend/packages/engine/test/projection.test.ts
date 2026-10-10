import { describe, expect, it } from 'vitest';
import { Projection } from '@paisa/contracts';
import { projectGrowth } from '../src';
import { content } from './fixtures';

const rates = content.tuning.projection;

describe('projectGrowth', () => {
  it('matches the future-value formula: 500 a month for 10 years at 8% is about 91,473', () => {
    const p = projectGrowth(500, [10], rates);
    const point = p.points[0]!;
    expect(point.average).toBe(91473);
    expect(point.bad).toBe(73625);
    expect(point.good).toBe(115019);
    expect(point.invested).toBe(60000);
    expect(point.years).toBe(10);
  });

  it('always carries three outcomes in order and the assumptions behind them', () => {
    const p = projectGrowth(500, [1, 5], rates);
    expect(Projection.safeParse(p).success).toBe(true);
    expect(p.assumptions).toEqual({
      monthlyAmount: 500,
      rates: { bad: 0.04, average: 0.08, good: 0.12 },
      compounding: 'monthly',
      note: 't:projection.assumption_note',
    });
    for (const pt of p.points) {
      expect(pt.bad).toBeLessThan(pt.average);
      expect(pt.average).toBeLessThan(pt.good);
      expect(pt.bad).toBeGreaterThan(pt.invested);
    }
  });

  it('handles a zero rate as plain saving', () => {
    const p = projectGrowth(500, [2], { bad: 0, average: 0, good: 0 });
    expect(p.points[0]).toEqual({ years: 2, invested: 12000, bad: 12000, average: 12000, good: 12000 });
  });

  it('defaults to 1, 5, 10 and 20 years', () => {
    expect(projectGrowth(100, [], rates).points.map((x) => x.years)).toEqual([1, 5, 10, 20]);
  });

  it('gives whole rupees and a zero point for zero years', () => {
    const p = projectGrowth(333, [0, 3], rates);
    expect(p.points[0]).toEqual({ years: 0, invested: 0, bad: 0, average: 0, good: 0 });
    for (const v of [p.points[1]!.bad, p.points[1]!.average, p.points[1]!.good]) expect(Number.isInteger(v)).toBe(true);
  });
});
