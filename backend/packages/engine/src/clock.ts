import type { Tuning } from '@paisa/contracts';

/** Absolute week index: month 1 week 1 is 1. */
export function absWeek(month: number, week: number, tuning: Tuning): number {
  return (month - 1) * tuning.weeksPerMonth + week;
}

export function finalWeek(tuning: Tuning): number {
  return tuning.months * tuning.weeksPerMonth;
}
