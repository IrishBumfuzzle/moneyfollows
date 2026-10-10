import type { GameEvent, Notice } from '@paisa/contracts';

/** What one call to `step` collects on the side. Never part of the saved state. */
export interface Out {
  notices: Notice[];
  events: GameEvent[];
}

export function newOut(): Out {
  return { notices: [], events: [] };
}

export function emit(out: Out, type: GameEvent['type'], payload: Record<string, unknown>): void {
  out.events.push({ type, payload });
}
