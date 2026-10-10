import type { GameContent, GameState, Pillar } from '@paisa/contracts';
import { emit, type Out } from './internal';
import { getPersona } from './lookup';

const bestIn = (state: GameState, pillar: Pillar): number =>
  state.decisions.filter((d) => d.pillar === pillar && d.rating === 'best').length;

/**
 * Awards any badge whose rule is now met, once each. `monthEndScore` is set
 * only when called at a month end, which is when the savings and score badges count.
 */
export function checkBadges(state: GameState, content: GameContent, out: Out, monthEndScore: number | null): GameState {
  const persona = getPersona(content, state.personaId);
  const rules: [string, boolean][] = [
    ['goal_getter', state.jars.goals >= state.goal.amount],
    ['rainy_day_ready', monthEndScore !== null && state.jars.savings >= persona.fixedCosts],
    ['budget_boss', monthEndScore !== null && monthEndScore >= 70 && state.debt === 0],
    ['scam_spotter', bestIn(state, 'stay_safe') >= 3],
    ['patient_investor', bestIn(state, 'understand_investing') >= 2],
  ];
  const earned = rules.filter(([id, ok]) => ok && !state.badges.includes(id)).map(([id]) => id);
  for (const id of earned) {
    out.notices.push({ kind: 'badge', value: id });
    emit(out, 'badge_earned', { badgeId: id });
  }
  return earned.length ? { ...state, badges: [...state.badges, ...earned] } : state;
}
