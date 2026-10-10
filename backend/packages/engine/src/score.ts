import type { GameContent, GameState, ScoreParts } from '@paisa/contracts';
import { getPersona } from './lookup';

const clip = (n: number): number => Math.min(1, Math.max(0, n));

/** Money Health Score for the month so far: 0-100, plus the four parts behind it. */
export function moneyHealth(state: GameState, content: GameContent): { score: number; parts: ScoreParts; saved: number } {
  const persona = getPersona(content, state.personaId);
  const { score: cfg } = content.tuning;
  const { income, jars: start } = state.monthStart;

  const saved = state.jars.savings + state.jars.goals - (start.savings + start.goals);
  const savingsRate = income > 0 ? clip(saved / income / cfg.savingsTarget) : 0;
  const monthOfNeeds = Math.max(1, persona.fixedCosts + Math.round((income * state.split.needs) / 100));
  const emergencyFund = clip(state.jars.savings / monthOfNeeds);
  const goalProgress = clip(state.jars.goals / state.goal.amount);
  const debtFree = 1 - clip(state.debt / Math.max(1, income));

  const w = cfg.weights;
  const total = w.savingsRate + w.emergencyFund + w.goalProgress + w.debt;
  const raw = w.savingsRate * savingsRate + w.emergencyFund * emergencyFund + w.goalProgress * goalProgress + w.debt * debtFree;
  const score = total > 0 ? Math.round((100 * raw) / total) : 0;
  return { score: Math.min(100, Math.max(0, score)), parts: { savingsRate, emergencyFund, goalProgress, debtFree }, saved };
}
