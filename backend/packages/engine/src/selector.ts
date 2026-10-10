import type { GameContent, GameState, Scenario } from '@paisa/contracts';
import { weightedPick } from './draw';
import { EngineError } from './errors';
import type { RngState } from './rng';

export const SCENARIO_RECENCY = 3;
const HABIT_PILLARS = ['save_manage', 'plan_budget'];

const flagOk = (s: Scenario, state: GameState): boolean => !s.requiresFlag || state.flags.includes(s.requiresFlag);

/** Picks this week's decision. Favors unseen cards and concepts where the player chose risky. */
export function pickScenario(state: GameState, content: GameContent, rng: RngState): [Scenario, RngState] {
  const forPersona = content.scenarios.filter((s) => s.personas.includes(state.personaId));
  const habit = state.decisions.filter((d) => HABIT_PILLARS.includes(d.pillar)).length;
  const investingLocked = state.level === 1 && habit < 2;

  let eligible = forPersona.filter(
    (s) => s.difficulty <= state.level && flagOk(s, state) && !(investingLocked && s.pillar === 'understand_investing'),
  );
  if (eligible.length === 0) eligible = forPersona.filter((s) => flagOk(s, state));
  if (eligible.length === 0) throw new EngineError('no_cards', `no scenarios for persona "${state.personaId}"`);

  const recent = state.seen.slice(-SCENARIO_RECENCY);
  const fresh = eligible.filter((s) => !recent.includes(s.id));
  const pool = fresh.length > 0 ? fresh : eligible;

  const weights = pool.map((s) => {
    const unseen = state.seen.includes(s.id) ? 0 : 4;
    const risky = state.decisions.filter((d) => d.concept === s.concept && d.rating === 'risky').length;
    return 1 + unseen + 2 * risky;
  });
  return weightedPick(pool, weights, rng);
}
