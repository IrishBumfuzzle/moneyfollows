import type { GameSnapshot, GameState } from '@paisa/contracts';

/** The full state without its own snapshot, so snapshots never nest. */
export function takeSnapshot(state: GameState): GameSnapshot {
  const { snapshot: _previous, ...rest } = state;
  return rest;
}

export function canRewind(state: GameState): boolean {
  return state.snapshot !== null && state.rewindTokens > 0;
}

/** Back to the snapshot exactly (rng included), minus one token. */
export function restoreSnapshot(state: GameState): GameState {
  if (!state.snapshot) return state;
  return { ...state.snapshot, rewindTokens: state.rewindTokens - 1, snapshot: null, notices: [] };
}
