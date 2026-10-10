import { describe, expect, it } from 'vitest';
import type { Card, ContentBundle, Consequence, GameState, TKey } from '@paisa/shared';
import { CONTINUE } from '@paisa/shared';
import { badges as bundledBadges, content as bundledContent, type Badge } from '@paisa/content';
import {
  awardXp,
  checkBadges,
  choose,
  createGame,
  createRewards,
  EngineError,
  isoWeekKey,
  isoWeeksInYear,
  nextCard,
  nextIsoWeek,
  recordWeekPlayed,
  rewardStep,
  rewind,
  XP,
  type Rewards,
} from '../src';
import { deepFreeze, fixture, withState } from './fixtures';

const t = (s: string): TKey => `t:${s}`;
const meta = { status: 'reviewed', author: 'test' } as const;
const badge = (id: string, rule: Badge['rule'], xp = 10): Badge => ({
  id,
  name: t(`badge.${id}.name`),
  description: t(`badge.${id}.desc`),
  icon: 'star',
  xp,
  rule,
  meta,
});

const firstChoice = (card: Card): string =>
  card.kind === 'monthEnd' ? CONTINUE : card.kind === 'yearEnd' ? '' : card.scenario.choices[0]!.id;

/** Plays a whole game, collecting rewards after every step. */
function playWithRewards(content: ContentBundle, seed: number, badges: Badge[] = bundledBadges) {
  let state = createGame('sana', 'starter', seed, content);
  let rewards = createRewards();
  const gains: { kind: Consequence['card']; xp: number; badges: string[] }[] = [];
  for (let i = 0; i < 200; i++) {
    const card = nextCard(state, content);
    if (card.kind === 'yearEnd') break;
    const { state: after, consequence } = choose(state, content, firstChoice(card));
    const r = rewardStep(rewards, state, after, consequence, content, badges);
    gains.push({ kind: consequence.card, ...r.gained });
    rewards = r.rewards;
    state = after;
  }
  return { state, rewards, gains };
}

describe('createRewards', () => {
  it('starts empty and round-trips through JSON', () => {
    const r = createRewards();
    expect(r).toEqual({ version: 1, xp: 0, badges: [], earned: [], streak: { current: 0, best: 0, lastWeek: null } });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('rewardStep', () => {
  it('pays decision XP once per week slot, so rewind and choose again pays nothing more', () => {
    const s0 = createGame('sana', 'starter', 7, fixture);
    const card = nextCard(s0, fixture);
    if (card.kind !== 'decision') throw new Error('expected a decision');
    const step1 = choose(s0, fixture, card.scenario.choices[0]!.id);
    const r1 = rewardStep(createRewards(), s0, step1.state, step1.consequence, fixture, []);
    expect(r1.gained.xp).toBe(XP.decision);

    const back = rewind(step1.state)!;
    const step2 = choose(back, fixture, card.scenario.choices[1]!.id);
    const r2 = rewardStep(r1.rewards, back, step2.state, step2.consequence, fixture, []);
    expect(r2.gained.xp).toBe(0);
    expect(r2.rewards.xp).toBe(XP.decision);
  });

  it('pays month XP with a score bonus when moving past the month-end report', () => {
    let state = createGame('sana', 'starter', 3, fixture);
    let rewards = createRewards();
    while (state.stage !== 'monthEnd') {
      const step = choose(state, fixture, firstChoice(nextCard(state, fixture)));
      rewards = rewardStep(rewards, state, step.state, step.consequence, fixture, []).rewards;
      state = step.state;
    }
    const before = rewards.xp;
    const step = choose(state, fixture, CONTINUE);
    const r = rewardStep(rewards, state, step.state, step.consequence, fixture, []);
    expect(r.gained.xp).toBe(XP.month + Math.floor((state.score ?? 0) / 10) * XP.perTenScore);
    expect(r.rewards.xp).toBe(before + r.gained.xp);
    expect(r.rewards.earned).toContain('month:1');
  });

  it('is deterministic and never mutates its inputs', () => {
    const a = playWithRewards(bundledContent, 42);
    const b = playWithRewards(bundledContent, 42);
    expect(a.rewards).toEqual(b.rewards);
    expect(a.gains).toEqual(b.gains);

    const s0 = deepFreeze(createGame('sana', 'starter', 42, bundledContent));
    const step = choose(s0, bundledContent, firstChoice(nextCard(s0, bundledContent)));
    const r0 = deepFreeze(createRewards());
    expect(() => rewardStep(r0, s0, deepFreeze(step.state), deepFreeze(step.consequence))).not.toThrow();
  });

  it('XP over a whole game is the sum of what each step reported', () => {
    for (const seed of [1, 2, 3, 99, 1234]) {
      const { rewards, gains } = playWithRewards(bundledContent, seed);
      expect(rewards.xp).toBe(gains.reduce((sum, g) => sum + g.xp, 0));
      expect(new Set(rewards.earned).size).toBe(rewards.earned.length);
      expect(rewards.badges).toEqual(gains.flatMap((g) => g.badges));
    }
  });

  it('awards the bundled first_step badge on the first card, with its XP, once', () => {
    const { gains, rewards } = playWithRewards(bundledContent, 5);
    const firstStep = bundledBadges.find((b) => b.id === 'first_step')!;
    expect(gains[0]!.badges).toContain('first_step');
    expect(gains[0]!.xp).toBe(XP.decision + firstStep.xp);
    expect(rewards.badges.filter((b) => b === 'first_step')).toHaveLength(1);
  });
});

describe('badge rules', () => {
  const s0 = createGame('sana', 'starter', 11, fixture);

  it('decisions counts cards played', () => {
    const rule = [badge('three', { kind: 'decisions', n: 3 })];
    expect(checkBadges(createRewards(), withState(s0, { seen: ['x', 'y'] }), fixture, rule).gained.badges).toEqual([]);
    expect(checkBadges(createRewards(), withState(s0, { seen: ['x', 'y', 'z'] }), fixture, rule).gained.badges).toEqual(
      ['three'],
    );
  });

  it('pillar_decisions counts distinct cards of that pillar only', () => {
    const ids = fixture.scenarios.filter((s) => s.pillar === 'plan_budget').map((s) => s.id);
    const rule = [badge('planner', { kind: 'pillar_decisions', pillar: 'plan_budget', n: 2 })];
    const once = withState(s0, { seen: [ids[0]!, ids[0]!] });
    expect(checkBadges(createRewards(), once, fixture, rule).gained.badges).toEqual([]);
    if (ids.length >= 2) {
      const twice = withState(s0, { seen: [ids[0]!, ids[1]!] });
      expect(checkBadges(createRewards(), twice, fixture, rule).gained.badges).toEqual(['planner']);
    }
  });

  it('emergency_fund needs savings of at least one month of Needs', () => {
    const rule = [badge('cushion', { kind: 'emergency_fund' })];
    const needs = s0.monthStart!.needsBudget;
    const short = withState(s0, { jars: { ...s0.jars, savings: needs - 1 } });
    const enough = withState(s0, { jars: { ...s0.jars, savings: needs } });
    expect(checkBadges(createRewards(), short, fixture, rule).gained.badges).toEqual([]);
    expect(checkBadges(createRewards(), enough, fixture, rule).gained.badges).toEqual(['cushion']);
  });

  it('emergency_fund with a percent needs that share of one month of Needs', () => {
    const rule = [badge('half', { kind: 'emergency_fund', percent: 50 })];
    const needs = s0.monthStart!.needsBudget;
    const half = Math.ceil(needs / 2);
    const short = withState(s0, { jars: { ...s0.jars, savings: half - 1 } });
    const enough = withState(s0, { jars: { ...s0.jars, savings: half } });
    expect(checkBadges(createRewards(), short, fixture, rule).gained.badges).toEqual([]);
    expect(checkBadges(createRewards(), enough, fixture, rule).gained.badges).toEqual(['half']);
  });

  it('goal_reached and month_score', () => {
    const rules = [badge('goal', { kind: 'goal_reached' }), badge('score', { kind: 'month_score', n: 70 })];
    const done = withState(s0, { goal: { amount: 1000, progress: 1000 }, scores: [40, 70] });
    expect(checkBadges(createRewards(), done, fixture, rules).gained.badges).toEqual(['goal', 'score']);
    const notYet = withState(s0, { goal: { amount: 1000, progress: 999 }, scores: [69] });
    expect(checkBadges(createRewards(), notYet, fixture, rules).gained.badges).toEqual([]);
  });

  it('a badge is awarded once and kept after a rewind', () => {
    const rule = [badge('one', { kind: 'decisions', n: 1 }, 25)];
    const played = withState(s0, { seen: ['x'] });
    const r1 = checkBadges(createRewards(), played, fixture, rule);
    expect(r1.gained).toEqual({ xp: 25, badges: ['one'] });
    const r2 = checkBadges(r1.rewards, s0, fixture, rule);
    expect(r2.gained).toEqual({ xp: 0, badges: [] });
    expect(r2.rewards.badges).toEqual(['one']);
  });
});

describe('awardXp', () => {
  it('is idempotent per source id', () => {
    const r1 = awardXp(createRewards(), 15, 'news:2026-W41:upi_fraud');
    const r2 = awardXp(r1, 15, 'news:2026-W41:upi_fraud');
    expect(r1.xp).toBe(15);
    expect(r2).toBe(r1);
    expect(awardXp(r2, 15, 'news:2026-W41:inflation').xp).toBe(30);
  });

  it('rejects negative, fractional and unnamed rewards', () => {
    expect(() => awardXp(createRewards(), -1, 'x')).toThrow(EngineError);
    expect(() => awardXp(createRewards(), 1.5, 'x')).toThrow(EngineError);
    expect(() => awardXp(createRewards(), 1, '')).toThrow(EngineError);
  });

  it('does not mutate its input', () => {
    const r0 = deepFreeze(createRewards());
    expect(() => awardXp(r0, 5, 'a')).not.toThrow();
    expect(r0.xp).toBe(0);
  });
});

describe('ISO week keys', () => {
  it('matches known ISO weeks, including year boundaries', () => {
    expect(isoWeekKey(2026, 10, 10)).toBe('2026-W41');
    expect(isoWeekKey(2026, 1, 1)).toBe('2026-W01'); // Thursday
    expect(isoWeekKey(2025, 12, 29)).toBe('2026-W01'); // Monday of 2026-W01
    expect(isoWeekKey(2027, 1, 1)).toBe('2026-W53'); // Friday, still in 2026's week 53
    expect(isoWeekKey(2027, 1, 4)).toBe('2027-W01');
    expect(isoWeekKey(2024, 12, 30)).toBe('2025-W01');
    expect(isoWeekKey(2021, 1, 3)).toBe('2020-W53');
  });

  it('knows which years have 53 weeks', () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2027)).toBe(52);
  });

  it('steps to the next week across year ends', () => {
    expect(nextIsoWeek('2026-W41')).toBe('2026-W42');
    expect(nextIsoWeek('2026-W53')).toBe('2027-W01');
    expect(nextIsoWeek('2025-W52')).toBe('2026-W01');
  });

  it('rejects bad dates and keys', () => {
    expect(() => isoWeekKey(2026, 2, 29)).toThrow(EngineError);
    expect(() => isoWeekKey(2026, 13, 1)).toThrow(EngineError);
    expect(() => nextIsoWeek('2025-W53')).toThrow(EngineError);
    expect(() => nextIsoWeek('2026-41')).toThrow(EngineError);
  });
});

describe('recordWeekPlayed', () => {
  const streakBadge = [badge('streak3', { kind: 'streak', weeks: 3 }, 20)];
  const record = (r: Rewards, ...weeks: string[]) =>
    weeks.reduce((acc, w) => recordWeekPlayed(acc, w, streakBadge).rewards, r);

  it('grows on consecutive weeks, ignores the same week, and restarts after a gap', () => {
    let r = record(createRewards(), '2026-W41');
    expect(r.streak).toEqual({ current: 1, best: 1, lastWeek: '2026-W41' });
    r = record(r, '2026-W41', '2026-W42');
    expect(r.streak.current).toBe(2);
    r = record(r, '2026-W44');
    expect(r.streak).toEqual({ current: 1, best: 2, lastWeek: '2026-W44' });
  });

  it('continues across a 53-week year end', () => {
    const r = record(createRewards(), '2026-W52', '2026-W53', '2027-W01');
    expect(r.streak.current).toBe(3);
  });

  it('ignores an earlier week (a wrong device clock)', () => {
    const r1 = record(createRewards(), '2026-W41', '2026-W42');
    const r2 = recordWeekPlayed(r1, '2026-W30', streakBadge);
    expect(r2.rewards).toBe(r1);
  });

  it('awards the streak badge once, with its XP, and keeps it after the streak breaks', () => {
    let r = createRewards();
    const gains = ['2026-W40', '2026-W41', '2026-W42', '2026-W45', '2026-W46', '2026-W47'].map((w) => {
      const step = recordWeekPlayed(r, w, streakBadge);
      r = step.rewards;
      return step.gained;
    });
    expect(gains.map((g) => g.badges)).toEqual([[], [], ['streak3'], [], [], []]);
    expect(r.xp).toBe(20);
    expect(r.badges).toEqual(['streak3']);
  });

  it('rejects malformed week keys', () => {
    expect(() => recordWeekPlayed(createRewards(), '2026-W99')).toThrow(EngineError);
    expect(() => recordWeekPlayed(createRewards(), 'week 41')).toThrow(EngineError);
  });
});

describe('bundled badges', () => {
  it('has 3 to 5 badges with unique ids', () => {
    expect(bundledBadges.length).toBeGreaterThanOrEqual(3);
    expect(bundledBadges.length).toBeLessThanOrEqual(5);
    expect(new Set(bundledBadges.map((b) => b.id)).size).toBe(bundledBadges.length);
  });

  it('every game-state badge can be earned in some normal play-through', () => {
    const earned = new Set<string>();
    for (let seed = 0; seed < 60; seed++)
      for (const b of playWithRewards(bundledContent, seed).rewards.badges) earned.add(b);
    for (const b of bundledBadges.filter((x) => x.rule.kind !== 'streak')) expect(earned, b.id).toContain(b.id);
  });
});

// Type-level check that the helpers above accept a real GameState.
export type _StateIsGameState = GameState;
