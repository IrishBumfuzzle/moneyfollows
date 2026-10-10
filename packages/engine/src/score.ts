import { MHS_WEIGHTS, REFLECTION_KEYS, SAVINGS_TARGET } from '@paisa/shared';
import type { GameState, MonthReport, ScoreParts } from '@paisa/shared';

const clip = (x: number): number => Math.min(1, Math.max(0, x));

/** Money Health Score v0 (CLAUDE.md 5.3). Pure; reads the payday snapshot in state.monthStart. */
export function monthReport(state: GameState): MonthReport {
  const start = state.monthStart;
  const income = start?.income ?? 0;
  const savedNow = state.jars.savings + state.jars.goals;
  const savedThen = start ? start.jars.savings + start.jars.goals : savedNow;

  const s = income > 0 ? clip((savedNow - savedThen) / income / SAVINGS_TARGET) : 0;
  const e = clip(state.jars.savings / Math.max(1, start?.needsBudget ?? 0));
  const g = clip(state.goal.progress / Math.max(1, state.goal.amount));
  const d = clip(state.debt / Math.max(1, income));
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
