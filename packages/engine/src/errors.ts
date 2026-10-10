export type EngineErrorCode =
  // quiz sessions (quiz-session.ts)
  | 'quiz_empty'
  | 'quiz_bad_count'
  | 'quiz_finished'
  | 'quiz_already_answered'
  | 'quiz_not_answered'
  | 'quiz_bad_choice'
  | 'quiz_not_finished'
  // game
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
