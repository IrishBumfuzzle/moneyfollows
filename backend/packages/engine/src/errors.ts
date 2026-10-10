export type EngineErrorCode =
  | 'invalid_action'
  | 'unknown_choice'
  | 'no_rewind'
  | 'game_over'
  | 'unknown_persona'
  | 'no_cards';

/** Thrown for anything the caller can cause: a bad action, a missing persona, an empty deck. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EngineError';
    this.code = code;
  }
}
