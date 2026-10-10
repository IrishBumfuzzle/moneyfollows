import {
  BASICS_BEFORE_INVESTING,
  LEVEL_MAX_DIFFICULTY,
  RECENT_DECISIONS,
  RECENT_EVENTS,
  UNSEEN_WEIGHT,
} from '@paisa/shared';
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
 * The week's pinned decisions (5.8): up to `n` different scenarios from decisionPool, each
 * weighted towards unseen cards and, while possible, at a place not already pinned this week,
 * so the map shows several places. Fewer than `n` only when the pool is that small.
 */
export function pickWeekDecisions(state: GameState, content: ContentBundle, n: number): Scenario[] {
  const pool = decisionPool(state, content);
  const seen = new Set(state.seen);
  const picked: Scenario[] = [];
  for (let i = 0; i < n; i++) {
    const left = pool.filter((s) => !picked.includes(s));
    if (left.length === 0) break;
    const usedPlaces = new Set(picked.map((s) => s.location));
    const newPlace = left.filter((s) => !usedPlaces.has(s.location));
    const from = newPlace.length > 0 ? newPlace : left;
    const pick = weightedPick(
      from,
      (s) => (seen.has(s.id) ? 1 : UNSEEN_WEIGHT),
      unit(state.seed, 'pin', state.month, state.week, i),
    );
    if (pick) picked.push(pick);
  }
  return picked;
}

/**
 * One decision card from decisionPool, weighted towards unseen cards. Undefined when no
 * scenario passes the gates. The game loop uses pickWeekDecisions; this stays for callers
 * that want a single card.
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
