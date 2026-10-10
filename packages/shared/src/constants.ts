import type { GrowthRates, JarId, Lang, Level, Pillar } from './types';

export const LANGS: readonly Lang[] = ['en', 'hi', 'te', 'ur'];
/** Languages that ship. Telugu is a machine draft behind VITE_SHOW_DRAFT_LANGS (7.4). */
export const SHIPPED_LANGS: readonly Lang[] = ['en', 'hi'];
export const PILLARS: readonly Pillar[] = ['plan_budget', 'save_manage', 'understand_investing', 'stay_safe'];
export const JARS: readonly JarId[] = ['needs', 'wants', 'goals', 'savings'];
export const LEVELS: readonly Level[] = ['starter', 'explorer', 'planner'];

/** Hackathon game length: 3 in-game months of 4 weeks. */
export const GAME_MONTHS = 3;
export const WEEKS_PER_MONTH = 4;
export const REWIND_TOKENS_PER_MONTH = 3;

/** Highest scenario difficulty each level sees. */
export const LEVEL_MAX_DIFFICULTY: Record<Level, 1 | 2 | 3> = { starter: 1, explorer: 2, planner: 3 };
/** Chance of a surprise event in a week. */
export const EVENT_CHANCE: Record<Level, number> = { starter: 0.2, explorer: 0.3, planner: 0.4 };

/** Money Health Score v0 (5.3). */
export const SAVINGS_TARGET = 0.2;
export const MHS_WEIGHTS = { s: 0.3, e: 0.3, g: 0.25, d: 0.15 } as const;

/** Time Machine assumed yearly rates (5.4). Placeholders: confirm with Vanguard compliance. */
export const GROWTH_RATES: GrowthRates = { low: 0.04, avg: 0.08, high: 0.12 };

/** choiceId that moves past the month-end report. */
export const CONTINUE = 'continue';

/** push_events accepts at most this many events per call. */
export const SYNC_BATCH_MAX = 500;

/**
 * Month-end reflection prompts monthReport picks from: the weakest score part,
 * or `great` when the score is 80 or more. Text lives in the i18n files.
 */
export const REFLECTION_KEYS = {
  s: 't:reflection.save_first',
  e: 't:reflection.build_cushion',
  g: 't:reflection.goal_steps',
  d: 't:reflection.pay_down_debt',
  great: 't:reflection.great_month',
} as const;
