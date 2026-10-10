import type { EventCard, GameContent, GameState } from '@paisa/contracts';
import { weightedPick } from './draw';
import type { RngState } from './rng';

export const EVENT_RECENCY = 8;

/** Weighted draw from the persona and level's deck, avoiding the last 8 cards shown. Null (no draw) if the deck is empty. */
export function drawEvent(state: GameState, content: GameContent, rng: RngState): [EventCard | null, RngState] {
  const deck = content.events.filter((e) => e.personas.includes(state.personaId) && e.levels.includes(state.level));
  if (deck.length === 0) return [null, rng];
  const recent = state.seen.slice(-EVENT_RECENCY);
  const fresh = deck.filter((e) => !recent.includes(e.id));
  const pool = fresh.length > 0 ? fresh : deck;
  return weightedPick(pool, pool.map((e) => e.weight), rng);
}
