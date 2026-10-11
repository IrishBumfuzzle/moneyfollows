// Time Machine (CLAUDE.md 5.4): explore how a monthly amount could grow, always as a low /
// average / high range from projectGrowth, then a short round of "which plan ends with more?".
// Pure: no clock, no randomness, never mutates its input. Practice only: nothing here touches
// the wallet.
import { projectGrowth } from '@paisa/engine';
import { GROWTH_RATES } from '@paisa/shared';
import type { GrowthRates, Projection } from '@paisa/shared';

export const MONTHLY = { min: 100, max: 2000, step: 50, start: 500 } as const;
export const YEARS = { min: 1, max: 30, step: 1, start: 10 } as const;

/** The end-of-term range for a plan: low, average and high after `years` years. */
export function rangeAt(p: Projection, years: number) {
  return { low: p.low[years] ?? 0, avg: p.avg[years] ?? 0, high: p.high[years] ?? 0 };
}

export interface Plan {
  monthly: number; // whole rupees a month
  years: number;
}

export interface Challenge {
  id: string;
  a: Plan;
  b: Plan;
}

/**
 * Hand-picked pairs that each teach one idea (time matters more than amount; starting earlier
 * beats saving more later; more each month helps at the same time). Only pairs whose ranges do
 * not overlap are used (see `answer`), so the right answer holds at every assumed rate.
 */
export const CHALLENGES: readonly Challenge[] = [
  { id: 'time_beats_amount', a: { monthly: 500, years: 5 }, b: { monthly: 250, years: 20 } },
  { id: 'start_early', a: { monthly: 300, years: 25 }, b: { monthly: 600, years: 8 } },
  { id: 'more_each_month', a: { monthly: 1000, years: 10 }, b: { monthly: 400, years: 10 } },
];

/**
 * Which plan ends with more: 'a' or 'b' when one plan's lowest outcome beats the other's
 * highest, else null (the ranges overlap, so no honest answer exists).
 */
export function answer(c: Challenge, rates: GrowthRates = GROWTH_RATES): 'a' | 'b' | null {
  const a = rangeAt(projectGrowth(c.a.monthly, c.a.years, rates), c.a.years);
  const b = rangeAt(projectGrowth(c.b.monthly, c.b.years, rates), c.b.years);
  if (a.low > b.high) return 'a';
  if (b.low > a.high) return 'b';
  return null;
}

/** Rupees put in over the plan (no growth): what the range is compared with. */
export const putIn = (p: Plan) => p.monthly * 12 * p.years;

export interface RoundResult {
  correct: number;
  total: number;
  score: number; // 0–100
}

/** Scores a finished round: `picks[i]` is the player's pick for CHALLENGES[i]. */
export function scoreRound(picks: readonly ('a' | 'b')[], rates: GrowthRates = GROWTH_RATES): RoundResult {
  const total = CHALLENGES.length;
  const correct = CHALLENGES.filter((c, i) => picks[i] !== undefined && picks[i] === answer(c, rates)).length;
  return { correct, total, score: Math.round((100 * correct) / total) };
}
