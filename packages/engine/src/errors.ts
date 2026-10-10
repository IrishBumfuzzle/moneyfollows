export type EngineErrorCode =
  | 'unknown_choice'
  | 'game_over'
  | 'unknown_persona'
  | 'no_cards'
  | 'invalid_seed'
  | 'invalid_reward'
  | 'invalid_week'
  | 'invalid_split';

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EngineError';
    this.code = code;
  }
}
