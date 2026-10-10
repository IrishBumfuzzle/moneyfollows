import { LEVEL_MAX_DIFFICULTY } from '@paisa/shared';
import type { ContentBundle, EventCard, GameState, Scenario } from '@paisa/shared';
import { unit, weightedPick } from './hash';

const RECENT_EVENTS = 6;
const RECENT_DECISIONS = 3;
const UNSEEN_WEIGHT = 5;
const BASICS_BEFORE_INVESTING = 2;

/** Events the persona and level allow, whose flag is set, not shown in the last 6 cards (relaxed if that leaves none). */
export function eligibleEvents(state: GameState, content: ContentBundle): EventCard[] {
  const base = content.events.filter(
    (e) =>
      e.personas.includes(state.personaId) &&
      e.levels.includes(state.level) &&
      (e.requiresFlag === undefined || state.flags.includes(e.requiresFlag)),
  );
  const recent = new Set(state.seen.slice(-RECENT_EVENTS));
  const fresh = base.filter((e) => !recent.has(e.id));
  return fresh.length > 0 ? fresh : base;
}

export function pickEvent(state: GameState, content: ContentBundle): EventCard | undefined {
  return weightedPick(
    eligibleEvents(state, content),
    (e) => e.weight,
    unit(state.seed, 'eventpick', state.month, state.week),
  );
}

/** True once the starter has made enough plan_budget or save_manage decisions to meet investing. */
function investingUnlocked(state: GameState, content: ContentBundle): boolean {
  const basics = new Set<string>(
    content.scenarios.filter((s) => s.pillar === 'plan_budget' || s.pillar === 'save_manage').map((s) => s.id),
  );
  return state.seen.filter((id) => basics.has(id)).length >= BASICS_BEFORE_INVESTING;
}

function decisionPool(state: GameState, content: ContentBundle, relaxed: boolean): Scenario[] {
  const maxDifficulty = LEVEL_MAX_DIFFICULTY[state.level];
  const locked = state.level === 'starter' && !investingUnlocked(state, content);
  const base = content.scenarios.filter(
    (s) =>
      s.personas.includes(state.personaId) &&
      (s.requiresFlag === undefined || state.flags.includes(s.requiresFlag)) &&
      (relaxed || (s.difficulty <= maxDifficulty && !(locked && s.pillar === 'understand_investing'))),
  );
  const recent = new Set(state.seen.slice(-RECENT_DECISIONS));
  const fresh = base.filter((s) => !recent.has(s.id));
  return fresh.length > 0 ? fresh : base;
}

/** The weekly decision card: filtered by persona, level, flags and the starter investing lock, then weighted towards unseen cards. */
export function pickDecision(state: GameState, content: ContentBundle): Scenario | undefined {
  let pool = decisionPool(state, content, false);
  if (pool.length === 0) pool = decisionPool(state, content, true);
  const seen = new Set(state.seen);
  return weightedPick(
    pool,
    (s) => (seen.has(s.id) ? 1 : UNSEEN_WEIGHT),
    unit(state.seed, 'pick', state.month, state.week, state.seen.length),
  );
}
