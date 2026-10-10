// Public engine API (CLAUDE.md 5.2). Pure TypeScript: no clock, no randomness, no I/O.
export { createGame, nextCard, choose, rewind, pinsForWeek, playAt, sleep, sleepStep, earn } from './game';
export type { SleepResult } from './game';
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
// Additive: Jar Splitter mini-game helpers (practice only, never changes GameState).
export { scoreJarSplit, jarSplitterRounds, emptySplit } from './jar-splitter';
export type { JarSplit, JarSplitResult, JarCheckResult } from './jar-splitter';
export { EngineError } from './errors';
export type { EngineErrorCode } from './errors';
