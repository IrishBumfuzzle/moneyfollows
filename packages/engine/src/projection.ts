import { GROWTH_RATES } from '@paisa/shared';
import type { GrowthRates, Projection } from '@paisa/shared';

function futureValue(monthly: number, yearlyRate: number, months: number): number {
  const i = yearlyRate / 12;
  return Math.round(i === 0 ? monthly * months : (monthly * ((1 + i) ** months - 1)) / i);
}

function series(monthly: number, rate: number, years: number): number[] {
  return Array.from({ length: years + 1 }, (_, y) => futureValue(monthly, rate, 12 * y));
}

/** Time Machine maths (CLAUDE.md 5.4): always a low, average and high series, value at the end of year 0..years. */
export function projectGrowth(monthlyAmount: number, years: number, rates: GrowthRates = GROWTH_RATES): Projection {
  const n = Math.max(0, Math.floor(years));
  return {
    low: series(monthlyAmount, rates.low, n),
    avg: series(monthlyAmount, rates.avg, n),
    high: series(monthlyAmount, rates.high, n),
  };
}
