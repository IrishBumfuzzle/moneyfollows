import { MHS_WEIGHTS, REFLECTION_KEYS, SAVINGS_TARGET } from '@paisa/shared';
import type { GameState, JarId, MonthReport, PendingEffect, ScoreParts } from '@paisa/shared';

const clip = (x: number): number => Math.min(1, Math.max(0, x));

/** Principal of `jar` still in flight: money a choice took out that a pending effect will pay back. */
export function inFlightOf(pending: readonly PendingEffect[], jar: JarId): number {
  return pending.reduce((sum, p) => sum + (p.principal?.[jar] ?? 0), 0);
}

/**
 * Money Health Score v0 (CLAUDE.md 5.3). Pure; reads the payday snapshot in state.monthStart.
 *
 * - s: net rupees put into savings + goals this month, including the payday split, over
 *   this month's income, against the 20% target. 0 in a zero-income month.
 * - e: savings jar over one month of Needs (the persona's Needs share).
 * - g: goal progress. d: debt over this month's income, or the persona's base income when
 *   this month's income is 0.
 *
 * In-flight investing: principal moved out of savings/goals into a delayed payoff to the same
 * jar (PendingEffect.principal, at most the payoff) still counts as saved in s and e, so
 * investing is not scored as spending. It stops counting when the payoff lands.
 */
export function monthReport(state: GameState): MonthReport {
  const start = state.monthStart;
  const income = start?.income ?? 0;
  const flightSavings = inFlightOf(state.pending, 'savings');
  const savedNow = state.jars.savings + state.jars.goals + flightSavings + inFlightOf(state.pending, 'goals');
  const savedThen = start
    ? start.jars.savings + start.jars.goals + (start.inFlight ?? 0) - (start.paydaySaved ?? 0)
    : savedNow;
  const debtBase = income > 0 ? income : (start?.baseIncome ?? 0);

  const s = income > 0 ? clip((savedNow - savedThen) / income / SAVINGS_TARGET) : 0;
  const e = clip((state.jars.savings + flightSavings) / Math.max(1, start?.needsBudget ?? 0));
  const g = clip(state.goal.progress / Math.max(1, state.goal.amount));
  const d = clip(state.debt / Math.max(1, debtBase));
  const parts: ScoreParts = { s, e, g, d };

  const score = Math.round(100 * (MHS_WEIGHTS.s * s + MHS_WEIGHTS.e * e + MHS_WEIGHTS.g * g + MHS_WEIGHTS.d * (1 - d)));

  let reflection: MonthReport['reflection'] = REFLECTION_KEYS.great;
  if (score < 80) {
    const candidates: [keyof typeof REFLECTION_KEYS, number][] = [
      ['s', s],
      ['e', e],
      ['g', g],
      ['d', 1 - d],
    ];
    let weakest = candidates[0] as [keyof typeof REFLECTION_KEYS, number];
    for (const c of candidates) if (c[1] < weakest[1]) weakest = c;
    reflection = REFLECTION_KEYS[weakest[0]];
  }
  return { score, parts, reflection };
}
