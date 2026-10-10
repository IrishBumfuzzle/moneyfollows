import { BASICS_BEFORE_INVESTING, LEVEL_MAX_DIFFICULTY, RECENT_DECISIONS, RECENT_EVENTS, UNSEEN_WEIGHT } from '@paisa/shared';
import type { ContentBundle, EventCard, GameState, Scenario } from '@paisa/shared';
import { unit, weightedPick } from './hash';

/**
 * Recency windows per card kind. `seen` mixes event and scenario ids, so each window only
 * counts its own kind: events never shrink the decision window and vice versa.
 */
function recentEventIds(state: GameState, content: ContentBundle): Set<string> {
  const ids = new Set(content.events.map((e) => e.id));
  return new Set(state.seen.filter((id) => ids.has(id)).slice(-RECENT_EVENTS));
}

function recentDecisionIds(state: GameState, content: ContentBundle): Set<string> {
  const ids = new Set(content.events.map((e) => e.id));
  return new Set(state.seen.filter((id) => !ids.has(id)).slice(-RECENT_DECISIONS));
}

/** Events the persona and level allow, whose flag is set, not among the last RECENT_EVENTS events seen (relaxed if that leaves none). */
export function eligibleEvents(state: GameState, content: ContentBundle): EventCard[] {
  const base = content.events.filter(
    (e) =>
      e.personas.includes(state.personaId) &&
      e.levels.includes(state.level) &&
      (e.requiresFlag === undefined || state.flags.includes(e.requiresFlag)),
  );
  const recent = recentEventIds(state, content);
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

/**
 * Scenarios that pass every gate (persona, flag, level difficulty, starter investing lock),
 * minus the last RECENT_DECISIONS decisions. Only recency is ever relaxed: if every gated
 * card is recent, the recent ones come back. The gates are never dropped.
 */
export function decisionPool(state: GameState, content: ContentBundle): Scenario[] {
  const maxDifficulty = LEVEL_MAX_DIFFICULTY[state.level];
  const locked = state.level === 'starter' && !investingUnlocked(state, content);
  const base = content.scenarios.filter(
    (s) =>
      s.personas.includes(state.personaId) &&
      (s.requiresFlag === undefined || state.flags.includes(s.requiresFlag)) &&
      s.difficulty <= maxDifficulty &&
      !(locked && s.pillar === 'understand_investing'),
  );
  const recent = recentDecisionIds(state, content);
  const fresh = base.filter((s) => !recent.has(s.id));
  return fresh.length > 0 ? fresh : base;
}

/**
 * The weekly decision card: from decisionPool, weighted towards unseen cards. Undefined when
 * no scenario passes the gates; nextCard turns that into a `no_cards` EngineError.
 */
export function pickDecision(state: GameState, content: ContentBundle): Scenario | undefined {
  const pool = decisionPool(state, content);
  if (pool.length === 0) return undefined;
  const seen = new Set(state.seen);
  return weightedPick(
    pool,
    (s) => (seen.has(s.id) ? 1 : UNSEEN_WEIGHT),
    unit(state.seed, 'pick', state.month, state.week, state.seen.length),
  );
}
