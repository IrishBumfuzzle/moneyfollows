import type { GameState } from '@paisa/contracts';
import type { Out } from './internal';

export const MILESTONES = [25, 50, 75, 100] as const;

export function goalProgress(goals: number, amount: number): number {
  return Math.min(1, goals / amount);
}

/** Pushes a notice the first time each 25/50/75/100% mark is reached. */
export function checkMilestones(state: GameState, out: Out): GameState {
  const reached = MILESTONES.filter((m) => state.jars.goals * 100 >= m * state.goal.amount && !state.milestones.includes(m));
  if (reached.length === 0) return state;
  for (const m of reached) out.notices.push({ kind: 'goal_milestone', value: m });
  return { ...state, milestones: [...state.milestones, ...reached] };
}
