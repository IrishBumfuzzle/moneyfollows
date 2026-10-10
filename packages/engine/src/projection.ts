import { GROWTH_RATES } from '@paisa/shared';
import type { GrowthRates, Projection } from '@paisa/shared';

/** Longest Time Machine horizon. Longer (or infinite) inputs are clamped to this. */
export const MAX_PROJECTION_YEARS = 100;

/** Whole rupees, and never -0. */
const rupees = (x: number): number => Math.round(x) + 0;

function futureValue(monthly: number, yearlyRate: number, months: number): number {
  const i = yearlyRate / 12;
  return rupees(i === 0 ? monthly * months : (monthly * ((1 + i) ** months - 1)) / i);
}

function series(monthly: number, rate: number, years: number): number[] {
  return Array.from({ length: years + 1 }, (_, y) => futureValue(monthly, rate, 12 * y));
}

/**
 * Time Machine maths (CLAUDE.md 5.4): always a low, average and high series, value at the
 * end of year 0..years, all three the same length.
 *
 * Inputs are clamped rather than rejected, so a slider can never crash the screen:
 * - monthlyAmount: rounded to whole rupees; negative or non-finite becomes 0.
 * - years: rounded down to a whole year; negative or NaN becomes 0, and anything above
 *   MAX_PROJECTION_YEARS (including Infinity) becomes MAX_PROJECTION_YEARS.
 * - a non-finite rate is treated as 0 (plain saving).
 */
export function projectGrowth(monthlyAmount: number, years: number, rates: GrowthRates = GROWTH_RATES): Projection {
  const monthly = Number.isFinite(monthlyAmount) ? Math.max(0, rupees(monthlyAmount)) : 0;
  const n = Number.isNaN(years) ? 0 : Math.min(MAX_PROJECTION_YEARS, Math.max(0, Math.floor(years)));
  const rate = (r: number): number => (Number.isFinite(r) ? r : 0);
  return {
    low: series(monthly, rate(rates.low), n),
    avg: series(monthly, rate(rates.avg), n),
    high: series(monthly, rate(rates.high), n),
  };
}
