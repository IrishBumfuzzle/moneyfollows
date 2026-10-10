// XP, badges and the weekly streak (CLAUDE.md section 2 "Should"). Pure and deterministic like
// the rest of the engine: no clock, no randomness, inputs never mutated.
//
// Rewards live in their own value next to GameState, so the frozen GameState contract is
// unchanged and a rewind never takes XP or badges back. XP is paid once per source id
// (a week's card, a month, a badge, a news article), so rewinding and choosing again,
// or replaying the same article, never pays twice.
import type { ContentBundle, Consequence, GameState } from '@paisa/shared';
import { badges as bundledBadges, content as bundledContent, type Badge, type BadgeRule } from '@paisa/content';
import { EngineError } from './errors';

export interface Rewards {
  version: 1;
  xp: number;
  /** Badge ids, in the order they were earned. */
  badges: string[];
  /** Source ids already paid, e.g. "card:m1w2:decision", "month:1", "badge:first_step", "news:2026-W41:upi_fraud". */
  earned: string[];
  /** Real-world weeks played in a row. Week keys are ISO weeks like "2026-W41". */
  streak: { current: number; best: number; lastWeek: string | null };
}

/** What one reward step paid, for the "+XP" toast and badge pop-up. */
export interface RewardGain {
  xp: number;
  badges: string[];
}

/** XP paid by the game loop. Badge XP comes from rewards/badges.json. */
export const XP = {
  /** Playing a weekly decision card. */
  decision: 10,
  /** Playing a surprise event card. */
  event: 5,
  /** Finishing a month (moving past the month-end report). */
  month: 20,
  /** Extra XP per full 10 points of that month's Money Health Score. */
  perTenScore: 2,
} as const;

export function createRewards(): Rewards {
  return { version: 1, xp: 0, badges: [], earned: [], streak: { current: 0, best: 0, lastWeek: null } };
}

function draftOf(r: Rewards): Rewards {
  return { ...r, badges: [...r.badges], earned: [...r.earned], streak: { ...r.streak } };
}

/** Pays on the draft once per source id. Returns the XP actually paid. */
function pay(d: Rewards, amount: number, sourceId: string): number {
  if (d.earned.includes(sourceId)) return 0;
  d.earned.push(sourceId);
  d.xp += amount;
  return amount;
}

/**
 * Pays XP for an outside source, e.g. a Paisa Times article: awardXp(r, 15, "news:2026-W41:upi_fraud").
 * Idempotent per sourceId. Negative or fractional amounts are rejected.
 */
export function awardXp(rewards: Rewards, amount: number, sourceId: string): Rewards {
  if (!Number.isInteger(amount) || amount < 0)
    throw new EngineError('invalid_reward', `XP must be a whole number ≥ 0: ${amount}`);
  if (sourceId.length === 0) throw new EngineError('invalid_reward', 'sourceId is required');
  if (rewards.earned.includes(sourceId)) return rewards;
  const d = draftOf(rewards);
  pay(d, amount, sourceId);
  return d;
}

/** Distinct cards played from one pillar, from GameState.seen (scenarios and events). */
function pillarCount(state: GameState, content: ContentBundle, pillar: string): number {
  const pillarOf = new Map<string, string>();
  for (const s of content.scenarios) pillarOf.set(s.id, s.pillar);
  for (const e of content.events) pillarOf.set(e.id, e.pillar);
  return new Set(state.seen.filter((id) => pillarOf.get(id) === pillar)).size;
}

/** Whether a rule holds. Rules about the game need a state; with none, only the streak rule can hold. */
function ruleHolds(rule: BadgeRule, r: Rewards, state: GameState | null, content: ContentBundle): boolean {
  if (rule.kind === 'streak') return r.streak.best >= rule.weeks;
  if (!state) return false;
  switch (rule.kind) {
    case 'decisions':
      return state.seen.length >= rule.n;
    case 'pillar_decisions':
      return pillarCount(state, content, rule.pillar) >= rule.n;
    case 'emergency_fund': {
      const needs = state.monthStart?.needsBudget ?? 0;
      return needs > 0 && state.jars.savings * 100 >= needs * (rule.percent ?? 100);
    }
    case 'goal_reached':
      return state.goal.amount > 0 && state.goal.progress >= state.goal.amount;
    case 'month_score':
      return (state.scores ?? []).some((s) => s >= rule.n);
  }
}

/** Awards every badge whose rule now holds, on the draft. Badges are never taken back. */
function awardBadges(d: Rewards, state: GameState | null, content: ContentBundle, badges: Badge[], gain: RewardGain) {
  for (const badge of badges) {
    if (d.badges.includes(badge.id) || !ruleHolds(badge.rule, d, state, content)) continue;
    d.badges.push(badge.id);
    gain.badges.push(badge.id);
    gain.xp += pay(d, badge.xp, `badge:${badge.id}`);
  }
}

/**
 * Rewards for one choose() step. Pass the state before the step, the state after it and the
 * consequence. XP for a card is keyed by its month, week and kind, so a rewind and a new
 * choice in the same week pays nothing more. Moving past a month-end report pays the month.
 */
export function rewardStep(
  rewards: Rewards,
  before: GameState,
  after: GameState,
  consequence: Consequence,
  content: ContentBundle = bundledContent,
  badges: Badge[] = bundledBadges,
): { rewards: Rewards; gained: RewardGain } {
  const d = draftOf(rewards);
  const gained: RewardGain = { xp: 0, badges: [] };
  if (consequence.card === 'decision' || consequence.card === 'event') {
    const amount = consequence.card === 'decision' ? XP.decision : XP.event;
    gained.xp += pay(d, amount, `card:m${before.month}w${before.week}:${consequence.card}`);
  } else if (consequence.card === 'monthEnd') {
    const score = before.score ?? 0;
    gained.xp += pay(d, XP.month + Math.floor(score / 10) * XP.perTenScore, `month:${before.month}`);
  }
  awardBadges(d, after, content, badges, gained);
  return { rewards: d, gained };
}

/** Badges whose rule holds for this state, without any other XP. Use after loading a save. */
export function checkBadges(
  rewards: Rewards,
  state: GameState | null,
  content: ContentBundle = bundledContent,
  badges: Badge[] = bundledBadges,
): { rewards: Rewards; gained: RewardGain } {
  const d = draftOf(rewards);
  const gained: RewardGain = { xp: 0, badges: [] };
  awardBadges(d, state, content, badges, gained);
  return { rewards: d, gained };
}

// ---- Weekly streak ---------------------------------------------------------------------
// The engine has no clock, so the app passes the real-world ISO week it is in ("2026-W41"),
// e.g. isoWeekKey(now.getFullYear(), now.getMonth() + 1, now.getDate()).

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

/** Day of the week, 1 = Monday … 7 = Sunday (Sakamoto's method). */
function isoWeekday(year: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  const sunday0 = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1]! + day) % 7;
  return sunday0 === 0 ? 7 : sunday0;
}

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** ISO years have 53 weeks when they start on a Thursday, or on a Wednesday in a leap year. */
export function isoWeeksInYear(year: number): number {
  const jan1 = isoWeekday(year, 1, 1);
  return jan1 === 4 || (jan1 === 3 && isLeap(year)) ? 53 : 52;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ISO 8601 week key for a calendar date (month 1–12), e.g. isoWeekKey(2026, 10, 10) → "2026-W41". */
export function isoWeekKey(year: number, month: number, day: number): string {
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(year) || month < 1 || month > 12 || !Number.isInteger(month)) {
    throw new EngineError('invalid_week', `not a calendar date: ${year}-${month}-${day}`);
  }
  if (!Number.isInteger(day) || day < 1 || day > days[month - 1]!) {
    throw new EngineError('invalid_week', `not a calendar date: ${year}-${month}-${day}`);
  }
  let ordinal = day;
  for (let m = 0; m < month - 1; m++) ordinal += days[m]!;
  const week = Math.floor((ordinal - isoWeekday(year, month, day) + 10) / 7);
  if (week < 1) return `${year - 1}-W${pad2(isoWeeksInYear(year - 1))}`;
  if (week > isoWeeksInYear(year)) return `${year + 1}-W01`;
  return `${year}-W${pad2(week)}`;
}

function parseWeekKey(key: string): { year: number; week: number } {
  const m = WEEK_KEY_RE.exec(key);
  const year = Number(m?.[1]);
  const week = Number(m?.[2]);
  if (!m || week < 1 || week > isoWeeksInYear(year)) {
    throw new EngineError('invalid_week', `week key must look like "2026-W41": ${key}`);
  }
  return { year, week };
}

/** The ISO week after this one: "2026-W53" → "2027-W01". */
export function nextIsoWeek(key: string): string {
  const { year, week } = parseWeekKey(key);
  return week < isoWeeksInYear(year) ? `${year}-W${pad2(week + 1)}` : `${year + 1}-W01`;
}

/**
 * Records that the student played in this real-world week. Same week: no change. The week
 * after the last one: the streak grows. A gap: the streak restarts at 1. An earlier week
 * (a wrong device clock) is ignored. Streak badges are awarded here.
 */
export function recordWeekPlayed(
  rewards: Rewards,
  weekKey: string,
  badges: Badge[] = bundledBadges,
): { rewards: Rewards; gained: RewardGain } {
  parseWeekKey(weekKey);
  const gained: RewardGain = { xp: 0, badges: [] };
  const last = rewards.streak.lastWeek;
  if (last !== null && weekKey <= last) return { rewards, gained };
  const d = draftOf(rewards);
  d.streak.current = last !== null && nextIsoWeek(last) === weekKey ? d.streak.current + 1 : 1;
  d.streak.best = Math.max(d.streak.best, d.streak.current);
  d.streak.lastWeek = weekKey;
  awardBadges(d, null, bundledContent, badges, gained);
  return { rewards: d, gained };
}
