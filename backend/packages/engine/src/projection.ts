import type { Projection, Tuning } from '@paisa/contracts';

export const DEFAULT_PROJECTION_YEARS = [1, 5, 10, 20];

function futureValue(monthly: number, yearlyRate: number, months: number): number {
  const i = yearlyRate / 12;
  return Math.round(i === 0 ? monthly * months : (monthly * ((1 + i) ** months - 1)) / i);
}

/** Time Machine maths: always the bad, average and good outcomes with the assumptions behind them. */
export function projectGrowth(monthlyAmount: number, years: number[], rates: Tuning['projection']): Projection {
  const ys = years.length > 0 ? years : DEFAULT_PROJECTION_YEARS;
  return {
    assumptions: {
      monthlyAmount,
      rates: { bad: rates.bad, average: rates.average, good: rates.good },
      compounding: 'monthly',
      note: 't:projection.assumption_note',
    },
    points: ys.map((t) => {
      const n = 12 * t;
      return {
        years: t,
        invested: monthlyAmount * n,
        bad: futureValue(monthlyAmount, rates.bad, n),
        average: futureValue(monthlyAmount, rates.average, n),
        good: futureValue(monthlyAmount, rates.good, n),
      };
    }),
  };
}
