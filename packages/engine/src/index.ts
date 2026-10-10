// Public engine API (CLAUDE.md 5.2). Pure TypeScript: no clock, no randomness, no I/O.
export { createGame, nextCard, choose, rewind } from './game';
export { monthReport } from './score';
export { projectGrowth } from './projection';
export { scoreQuiz, quizFor, shuffleOptions } from './quiz';
export { createDemoGame, DEMO_SEED } from './demo';
// Additive: XP, badges and the weekly streak. Kept beside GameState, not inside it.
export {
  createRewards,
  rewardStep,
  checkBadges,
  awardXp,
  recordWeekPlayed,
  isoWeekKey,
  isoWeeksInYear,
  nextIsoWeek,
  XP,
} from './rewards';
export type { Rewards, RewardGain } from './rewards';
export { EngineError } from './errors';
export type { EngineErrorCode } from './errors';
