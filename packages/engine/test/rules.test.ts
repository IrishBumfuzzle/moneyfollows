import { describe, expect, it } from 'vitest';
import { DECISIONS_PER_WEEK, GAME_MONTHS, GameStateSchema, REWIND_TOKENS_PER_MONTH } from '@paisa/shared';
import type { GameState } from '@paisa/shared';
import { EngineError, choose, createGame, monthReport, nextCard, rewind } from '../src';
import { applyToWallet } from '../src/wallet';
import { hash, unit } from '../src/hash';
import { bundle, choice, deepFreeze, fixture, sana, scenario, withState } from './fixtures';
import { always, at, first, play, playGame } from './helpers';

const noEvents = bundle({ events: [] });

describe('rule 1: deterministic', () => {
  it('same persona, level, seed and choices give an identical game', () => {
    const a = playGame(fixture, 'sana', 'explorer', 7);
    const b = playGame(fixture, 'sana', 'explorer', 7);
    expect(a.state).toEqual(b.state);
    expect(a.log).toEqual(b.log);
  });

  it('different seeds eventually give different games', () => {
    const logs = new Set(Array.from({ length: 20 }, (_, i) => playGame(fixture, 'ravi', 'planner', i).log.join('\n')));
    expect(logs.size).toBeGreaterThan(1);
  });

  it('hash is stable and unit is in [0, 1)', () => {
    expect(hash(1, 'a', 2)).toBe(hash(1, 'a', 2));
    expect(hash(1, 'a', 2)).not.toBe(hash(1, 'a', 3));
    for (let i = 0; i < 1000; i++) {
      const u = unit(i, 'x', i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe('rule 2: immutable', () => {
  it('never mutates state or content', () => {
    const content = deepFreeze(structuredClone(fixture));
    let s = deepFreeze(createGame('sana', 'planner', 3, content));
    for (let i = 0; i < 200; i++) {
      const card = nextCard(s, content);
      if (card.kind === 'yearEnd') break;
      monthReport(s);
      const before = JSON.stringify(s);
      const r = choose(s, content, first(card));
      expect(JSON.stringify(s)).toBe(before);
      const back = rewind(deepFreeze(r.state));
      if (back) deepFreeze(back);
      s = deepFreeze(r.state);
    }
    expect(s.stage).toBe('yearEnd');
  });
});

describe('rule 3: jars never negative', () => {
  it('wallet borrows the shortfall and reports it', () => {
    const r = applyToWallet({ needs: 100, wants: 50, goals: 0, savings: 0 }, 10, { jars: { wants: -80, needs: -20 } });
    expect(r.jars).toEqual({ needs: 80, wants: 0, goals: 0, savings: 0 });
    expect(r.debt).toBe(40);
    expect(r.applied).toEqual({ jars: { needs: -20, wants: -50 }, debt: 30, borrowed: 30 });
  });

  it('caps a repayment, and the jar charge that pays for it, at the debt owed', () => {
    // debt 100, "pay back 500 from Needs": only 100 is owed, so only 100 leaves the jar
    const r = applyToWallet({ needs: 1000, wants: 0, goals: 0, savings: 0 }, 100, { jars: { needs: -500 }, debt: -500 });
    expect(r.debt).toBe(0);
    expect(r.jars.needs).toBe(900);
    expect(r.applied).toEqual({ jars: { needs: -100 }, debt: -100, borrowed: 0 });

    // the jar spend is cut by the unpaid excess but never below what was actually repaid
    const small = applyToWallet({ needs: 100, wants: 50, goals: 0, savings: 0 }, 20, { jars: { wants: -50 }, debt: -500 });
    expect(small.debt).toBe(0);
    expect(small.jars.wants).toBe(30);
    expect(small.applied).toEqual({ jars: { wants: -20 }, debt: -20, borrowed: 0 });

    // nothing owed: nothing repaid and nothing charged
    const none = applyToWallet({ needs: 1000, wants: 0, goals: 0, savings: 0 }, 0, { jars: { needs: -500 }, debt: -500 });
    expect(none.jars.needs).toBe(1000);
    expect(none.applied).toEqual({ jars: {}, debt: 0, borrowed: 0 });

    // a repayment within the debt is untouched
    const ok = applyToWallet({ needs: 1000, wants: 0, goals: 0, savings: 0 }, 800, { jars: { needs: -500 }, debt: -500 });
    expect(ok.applied).toEqual({ jars: { needs: -500 }, debt: -500, borrowed: 0 });
  });

  it('a choice that overspends borrows, and debt and jars stay in range for a whole game', () => {
    const big = bundle({
      events: [],
      scenarios: [scenario('big', { choices: [choice('a', { jars: { wants: -99999 }, debt: -500 })] })],
    });
    const s0 = createGame('sana', 'starter', 1, big);
    expect(s0.debt).toBe(0);
    const { state, consequence } = choose(s0, big, 'a');
    // no debt is owed, so the "repay 500" part is neither repaid nor charged
    expect(state.jars.wants).toBe(0);
    expect(consequence.applied.borrowed).toBe(99999 - 500 - s0.jars.wants);
    expect(consequence.applied.jars.wants).toBe(-s0.jars.wants);
    expect(state.debt).toBe(consequence.applied.borrowed);
    const end = play(s0, big).state;
    for (const v of Object.values(end.jars)) expect(v).toBeGreaterThanOrEqual(0);
    expect(end.debt).toBeGreaterThanOrEqual(0);
  });

  it('flags are added once', () => {
    const c = bundle({
      events: [],
      scenarios: [scenario('f', { choices: [choice('a', { flags: ['x', 'x', 'y'] })] })],
    });
    const s = play(createGame('sana', 'starter', 1, c), c, first, (st) => st.week === 3).state;
    expect(s.flags).toEqual(['x', 'y']);
  });

  it('goal.progress follows the goals jar', () => {
    const c = bundle({
      events: [],
      scenarios: [scenario('g', { choices: [choice('a', { jars: { goals: 123 } })] })],
    });
    const s0 = createGame('sana', 'starter', 1, c);
    const s1 = choose(s0, c, 'a').state;
    expect(s1.goal.progress).toBe(s1.jars.goals);
    expect(s1.jars.goals).toBe(s0.jars.goals + 123);
  });
});

describe('rule 4: rewind', () => {
  it('restores the exact prior state and consumes a token', () => {
    const s0 = createGame('sana', 'explorer', 5, fixture);
    const card = nextCard(s0, fixture);
    if (card.kind === 'yearEnd' || card.kind === 'monthEnd') throw new Error('unexpected');
    const s1 = choose(s0, fixture, card.scenario.choices[1]!.id).state;
    expect(s1.history).toHaveLength(1);
    const back = rewind(s1)!;
    expect(back).toEqual({ ...s0, rewindTokens: REWIND_TOKENS_PER_MONTH - 1 });
    expect(back.history).toEqual([]);
    expect(nextCard(back, fixture)).toEqual(card);
  });

  it('snapshots do not nest and replay identically after a rewind', () => {
    const s0 = createGame('ravi', 'planner', 11, fixture);
    const s2 = play(s0, fixture, first, (s) => s.week === 3).state;
    for (const snap of s2.history) expect(snap).not.toHaveProperty('history');
    const back = rewind(s2)!;
    const again = choose(back, fixture, first(nextCard(back, fixture))).state;
    expect({ ...again, rewindTokens: 0, history: [] }).toEqual({ ...s2, rewindTokens: 0, history: [] });
  });

  it('stops at zero tokens and with no history', () => {
    expect(rewind(createGame('sana', 'starter', 1, noEvents))).toBeNull();
    // One snapshot per pin played this month: 3 weeks of starter pins before week 4.
    let s = play(createGame('sana', 'starter', 1, noEvents), noEvents, first, (st) => st.week === 4).state;
    expect(s.history.length).toBe(3 * DECISIONS_PER_WEEK.starter);
    const depth = s.history.length;
    for (let i = 0; i < REWIND_TOKENS_PER_MONTH; i++) s = rewind(s)!;
    expect(s.rewindTokens).toBe(0);
    expect(s.history).toHaveLength(depth - REWIND_TOKENS_PER_MONTH);
    expect(rewind(s)).toBeNull();
    const withTokensNoHistory = { ...createGame('sana', 'starter', 1, noEvents), rewindTokens: 2 };
    expect(rewind(withTokensNoHistory)).toBeNull();
  });

  it('cannot cross back over a month boundary', () => {
    // month 1 fully played (one snapshot per pin), at month end: a rewind is still allowed here
    const atEnd = play(createGame('sana', 'starter', 1, noEvents), noEvents, first, (st) => st.stage === 'monthEnd').state;
    expect(atEnd.history).toHaveLength(4 * DECISIONS_PER_WEEK.starter);
    expect(rewind(atEnd)?.stage).toBe('decision');
    // after continue the new month has tokens but no way back into month 1
    const m2 = choose(atEnd, noEvents, 'continue').state;
    expect(m2.month).toBe(2);
    expect(m2.rewindTokens).toBe(REWIND_TOKENS_PER_MONTH);
    expect(rewind(m2)).toBeNull();
    // one choice into month 2: rewinding lands at month 2 week 1, not in month 1
    const m2w2 = choose(m2, noEvents, 'a').state;
    const back = rewind(m2w2)!;
    expect([back.month, back.week]).toEqual([2, 1]);
    expect(rewind(back)).toBeNull();
  });

  it('is blocked once the year is over, even with tokens and history left', () => {
    const end = play(createGame('sana', 'starter', 1, noEvents), noEvents).state;
    expect(end.stage).toBe('yearEnd');
    expect(end.rewindTokens).toBeGreaterThan(0);
    expect(end.history.length).toBeGreaterThan(0);
    expect(rewind(end)).toBeNull();
  });

  it('refills tokens and clears history at a new month', () => {
    let s = play(createGame('sana', 'starter', 1, noEvents), noEvents, first, (st) => st.week === 3).state;
    s = rewind(s)!;
    expect(s.rewindTokens).toBe(2);
    s = play(s, noEvents, first, (st) => st.stage === 'monthEnd').state;
    s = choose(s, noEvents, 'continue').state;
    expect(s.month).toBe(2);
    expect(s.rewindTokens).toBe(REWIND_TOKENS_PER_MONTH);
    expect(s.history).toEqual([]);
    expect(rewind(s)).toBeNull();
  });
});

describe('rule 5: delayed effects', () => {
  const delayedScenario = (afterWeeks: number) =>
    bundle({
      events: [],
      scenarios: [
        scenario('d', {
          choices: [
            choice(
              'a',
              {},
              { delayed: [{ afterWeeks, effects: { jars: { savings: 500 }, flags: ['paid'] }, note: 't:note.later' }] },
            ),
            choice('b'),
          ],
        }),
      ],
    });

  it('queues with the right due week and lands when that week starts', () => {
    const c = delayedScenario(2);
    let s = play(createGame('sana', 'starter', 1, c), c, always('b'), at(1, 2)).state;
    const r = choose(s, c, 'a');
    expect(r.consequence.delayedQueued).toBe(1);
    expect(r.state.pending).toEqual([
      { dueMonth: 1, dueWeek: 4, effects: { jars: { savings: 500 }, flags: ['paid'] }, note: 't:note.later' },
    ]);
    expect(r.consequence.landed).toEqual([]); // week 3 starts, nothing due yet
    s = r.state;
    const savings = s.jars.savings;
    const w4 = choose(s, c, 'b');
    expect(w4.consequence.landed).toHaveLength(1);
    expect(w4.consequence.landed[0]!.applied.jars.savings).toBe(500);
    expect(w4.state.jars.savings).toBe(savings + 500);
    expect(w4.state.flags).toContain('paid');
    expect(w4.state.pending).toEqual([]);
  });

  it('fires across a month boundary, after payday', () => {
    const c = delayedScenario(2);
    const s = play(createGame('sana', 'starter', 1, c), c, always('b'), at(1, 3)).state;
    const queued = choose(s, c, 'a').state; // abs week 3 + 2 = month 2 week 1
    expect(queued.pending[0]).toMatchObject({ dueMonth: 2, dueWeek: 1 });
    const atEnd = play(queued, c, always('b'), (st) => st.stage === 'monthEnd').state;
    expect(atEnd.pending).toHaveLength(1);
    const savingsBefore = atEnd.jars.savings;
    const r = choose(atEnd, c, 'continue');
    expect(r.consequence.payday?.income).toBe(8000);
    expect(r.consequence.landed).toHaveLength(1);
    expect(r.state.jars.savings).toBe(savingsBefore + 1600 + 500);
    expect(r.state.pending).toEqual([]);
  });

  it('lands in a later month than the next one', () => {
    const c = delayedScenario(6);
    const s = play(createGame('sana', 'starter', 1, c), c, always('b'), at(1, 3)).state;
    const q = choose(s, c, 'a').state;
    expect(q.pending[0]).toMatchObject({ dueMonth: 3, dueWeek: 1 });
  });

  it('keeps effects due after the last week queued and settles them at year end', () => {
    const c = delayedScenario(3);
    const s = play(createGame('sana', 'starter', 1, c), c, always('b'), at(GAME_MONTHS, 4)).state;
    const r = choose(s, c, 'a');
    expect(r.consequence.delayedQueued).toBe(1);
    expect(r.state.pending).toEqual([
      { dueMonth: GAME_MONTHS + 1, dueWeek: 3, effects: { jars: { savings: 500 }, flags: ['paid'] }, note: 't:note.later' },
    ]);
    expect(r.state.stage).toBe('monthEnd');
    const end = choose(r.state, c, 'continue');
    expect(end.state.stage).toBe('yearEnd');
    expect(end.state.pending).toEqual([]);
    expect(end.consequence.landed).toEqual([
      { note: 't:note.later', applied: { jars: { savings: 500 }, debt: 0, borrowed: 0 } },
    ]);
    expect(end.state.jars.savings).toBe(r.state.jars.savings + 500);
    expect(end.state.flags).toContain('paid');
  });

  it('settles every pending effect at year end, oldest due first', () => {
    const c = delayedScenario(6);
    const s = play(createGame('sana', 'starter', 1, c), c, always('b'), at(GAME_MONTHS, 2)).state;
    const q1 = choose(s, c, 'a').state; // due 3w2 + 6 = abs week 16
    const q2 = choose(q1, c, 'a').state; // due 3w3 + 6 = abs week 17
    const atEnd = choose(q2, c, 'b').state;
    expect(atEnd.pending).toHaveLength(2);
    const end = choose(atEnd, c, 'continue');
    expect(end.consequence.landed).toHaveLength(2);
    expect(end.state.jars.savings).toBe(atEnd.jars.savings + 1000);
    expect(end.state.pending).toEqual([]);
  });
});

describe('rule 6: serializable', () => {
  it('round-trips through JSON at every step of a game', () => {
    let s = createGame('ravi', 'planner', 99, fixture);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    for (let i = 0; i < 60 && s.stage !== 'yearEnd'; i++) {
      s = choose(s, fixture, first(nextCard(s, fixture))).state;
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      expect(Object.values(s).includes(undefined)).toBe(false);
    }
  });

  it('every state of a game passes GameStateSchema', () => {
    let s = createGame('sana', 'planner', 5, fixture);
    expect(GameStateSchema.safeParse(s).success).toBe(true);
    for (let i = 0; i < 60 && s.stage !== 'yearEnd'; i++) {
      s = choose(s, fixture, first(nextCard(s, fixture))).state;
      const r = GameStateSchema.safeParse(JSON.parse(JSON.stringify(s)));
      expect(r.error).toBeUndefined();
    }
    expect(GameStateSchema.safeParse({ ...s, jars: { ...s.jars, needs: -1 } }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...s, seed: -1 }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...s, week: 5 }).success).toBe(false);
  });
});

describe('payday', () => {
  it('splits income, takes fixed costs from needs and sets monthStart', () => {
    const s = createGame('sana', 'starter', 1, noEvents);
    expect(s.jars).toEqual({ needs: 500 + 4000 - 1000, wants: 200 + 1600, goals: 800, savings: 300 + 1600 });
    expect(s.goal.progress).toBe(800);
    // needsBudget is one month of Needs: the 50% share (4000), which already pays the 1000 fixed costs
    expect(s.monthStart).toEqual({
      jars: s.jars,
      debt: 0,
      income: 8000,
      needsBudget: 4000,
      paydaySaved: 1600 + 800,
      inFlight: 0,
      baseIncome: 8000,
    });
    expect(s.rewindTokens).toBe(3);
    expect(s.stage).toBe('decision');
  });

  it('gives the rounding remainder to needs', () => {
    const odd = {
      ...sana,
      income: { pattern: 'steady' as const, amount: 1001 },
      split: { needs: 34, wants: 33, goals: 17, savings: 16 },
      fixedCosts: 0,
      startingJars: { needs: 0, wants: 0, goals: 0, savings: 0 },
    };
    const s = createGame('sana', 'starter', 1, bundle({ events: [], personas: [odd] }));
    expect(s.jars).toEqual({ needs: 341, wants: 330, goals: 170, savings: 160 });
  });

  it('borrows when fixed costs exceed needs', () => {
    const poor = {
      ...sana,
      income: { pattern: 'steady' as const, amount: 1000 },
      fixedCosts: 900,
      startingJars: { needs: 0, wants: 0, goals: 0, savings: 0 },
    };
    const s = createGame('sana', 'starter', 1, bundle({ events: [], personas: [poor] }));
    expect(s.jars.needs).toBe(0);
    expect(s.debt).toBe(400);
  });

  it('irregular income stays in range, on the step, and varies by seed', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const income = createGame('ravi', 'starter', seed, noEvents).monthStart!.income;
      expect(income % 500).toBe(0);
      expect(income).toBeGreaterThanOrEqual(3000);
      expect(income).toBeLessThanOrEqual(6000);
      seen.add(income);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([3000, 3500, 4000, 4500, 5000, 5500, 6000]);
  });

  it('seasonal income follows the month multiplier and is reported on the choose that starts the month', () => {
    const seasonal = {
      ...sana,
      income: { pattern: 'seasonal' as const, amount: 1000, multipliers: [1, 1.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    };
    const c = bundle({ events: [], personas: [seasonal] });
    const atEnd = play(createGame('sana', 'starter', 1, c), c, first, (s) => s.stage === 'monthEnd').state;
    const r = choose(atEnd, c, 'continue');
    expect(r.consequence.payday?.income).toBe(1500);
    expect(r.state.monthStart?.income).toBe(1500);
  });

  it('uses the base income for needsBudget in a zero-income month', () => {
    const seasonal = {
      ...sana,
      income: { pattern: 'seasonal' as const, amount: 8000, multipliers: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    };
    const s = createGame('sana', 'starter', 1, bundle({ events: [], personas: [seasonal] }));
    expect(s.monthStart).toMatchObject({ income: 0, needsBudget: 4000, baseIncome: 8000, paydaySaved: 0 });
  });

  it('validates the seed as a uint32 integer', () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        createGame('sana', 'starter', bad, noEvents);
        expect.unreachable();
      } catch (e) {
        expect((e as EngineError).code).toBe('invalid_seed');
      }
    }
    expect(createGame('sana', 'starter', 0, noEvents).seed).toBe(0);
    expect(createGame('sana', 'starter', 2 ** 32 - 1, noEvents).seed).toBe(2 ** 32 - 1);
  });

  it('unknown persona throws', () => {
    expect(() => createGame('kiran', 'starter', 1, fixture)).toThrowError(EngineError);
    try {
      createGame('kiran', 'starter', 1, fixture);
    } catch (e) {
      expect((e as EngineError).code).toBe('unknown_persona');
    }
  });
});

describe('events', () => {
  it('rolls at about the level chance, and never with an empty deck', () => {
    let hits = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (createGame('sana', 'planner', seed, fixture).stage === 'event') hits++;
      expect(createGame('sana', 'planner', seed, noEvents).stage).toBe('decision');
    }
    expect(hits / 400).toBeGreaterThan(0.3);
    expect(hits / 400).toBeLessThan(0.5);
  });

  it('an event is answered in the same week, then the decision follows', () => {
    const seed = Array.from({ length: 200 }, (_, i) => i).find(
      (i) => createGame('sana', 'planner', i, fixture).stage === 'event',
    )!;
    const s0 = createGame('sana', 'planner', seed, fixture);
    const card = nextCard(s0, fixture);
    expect(card.kind).toBe('event');
    const r = choose(s0, fixture, 'a');
    expect(r.consequence.card).toBe('event');
    expect(r.state.week).toBe(1);
    expect(r.state.stage).toBe('decision');
    expect(r.state.seen).toHaveLength(1);
    expect(nextCard(r.state, fixture).kind).toBe('decision');
    expect(r.state.history).toHaveLength(1);
  });

  it('a single-choice event can be answered', () => {
    const only = bundle({ events: [fixture.events[1]!] });
    const seed = Array.from({ length: 200 }, (_, i) => i).find(
      (i) => createGame('sana', 'planner', i, only).stage === 'event',
    )!;
    const s = createGame('sana', 'planner', seed, only);
    expect(choose(s, only, 'ok').state.stage).toBe('decision');
    expect(() => choose(s, only, 'a')).toThrowError(EngineError);
  });

  it('respects level, persona and requiresFlag, and avoids recent repeats', () => {
    const ev = bundle({
      events: [
        { ...fixture.events[0]!, id: 'e.planner_only', levels: ['planner'] },
        { ...fixture.events[0]!, id: 'e.flag', requiresFlag: 'borrowed_friend' },
      ],
    });
    for (let seed = 0; seed < 100; seed++) expect(createGame('sana', 'explorer', seed, ev).stage).toBe('decision');
    // flag gate: only e.flag eligible once the flag is set
    const flagged = withState(createGame('sana', 'explorer', 1, ev), { flags: ['borrowed_friend'], stage: 'event' });
    const card = nextCard(flagged, ev);
    expect(card.kind === 'event' && card.scenario.id).toBe('e.flag');
    // recent repeat is relaxed rather than failing when it is the only event
    const repeated = withState(flagged, { seen: ['e.flag'] });
    expect(nextCard(repeated, ev).kind).toBe('event');
  });
});

describe('errors', () => {
  it('unknown choice, game over and no cards', () => {
    const s = createGame('sana', 'starter', 1, noEvents);
    expect(() => choose(s, noEvents, 'zzz')).toThrowError(EngineError);
    expect(() => choose(s, noEvents, 'continue')).toThrowError(/unknown choice/);
    const empty = bundle({ events: [], scenarios: [] });
    try {
      nextCard(s, empty);
      expect.unreachable();
    } catch (e) {
      expect((e as EngineError).code).toBe('no_cards');
    }
    const over = play(s, noEvents).state;
    try {
      choose(over, noEvents, 'continue');
      expect.unreachable();
    } catch (e) {
      expect((e as EngineError).code).toBe('game_over');
    }
  });
});

describe('game flow', () => {
  const s0 = createGame('sana', 'starter', 4, noEvents);

  it('month end shows a report, only accepts continue, then starts the next month', () => {
    const atEnd = play(s0, noEvents, first, (s) => s.stage === 'monthEnd').state;
    expect(atEnd.week).toBe(4);
    expect(atEnd.scores).toHaveLength(1);
    expect(atEnd.score).toBe(atEnd.scores![0]);
    const card = nextCard(atEnd, noEvents);
    expect(card.kind).toBe('monthEnd');
    expect(card.kind === 'monthEnd' && card.report).toEqual(monthReport(atEnd));
    expect(() => choose(atEnd, noEvents, 'a')).toThrowError(EngineError);

    const r = choose(atEnd, noEvents, 'continue');
    expect(r.consequence).toMatchObject({
      card: 'monthEnd',
      choiceId: 'continue',
      applied: { jars: {}, debt: 0, borrowed: 0 },
    });
    expect(r.consequence.payday?.income).toBe(8000);
    expect(r.state).toMatchObject({ month: 2, week: 1, rewindTokens: 3, history: [] });
    expect(r.state.jars.needs).toBe(atEnd.jars.needs + 3000);
    expect(nextCard(r.state, noEvents).kind).toBe('decision');
  });

  it('reaches yearEnd after GAME_MONTHS with one score per month', () => {
    const end = play(s0, noEvents).state;
    expect(end.stage).toBe('yearEnd');
    expect(end.month).toBe(GAME_MONTHS);
    expect(end.scores).toHaveLength(GAME_MONTHS);
    const card = nextCard(end, noEvents);
    expect(card).toEqual({ kind: 'yearEnd', scores: end.scores, goalReached: end.goal.progress >= end.goal.amount });
  });

  it('yearEnd goalReached reads goal.progress, like everywhere else', () => {
    const end = play(s0, noEvents).state;
    const reached = { ...end, goal: { amount: 100, progress: 100 }, jars: { ...end.jars, goals: 0 } };
    expect(nextCard(reached, noEvents)).toMatchObject({ kind: 'yearEnd', goalReached: true });
    const short = { ...end, goal: { amount: 100, progress: 99 }, jars: { ...end.jars, goals: 1000 } };
    expect(nextCard(short, noEvents)).toMatchObject({ kind: 'yearEnd', goalReached: false });
  });

  it('records seen ids and deduped lessons, and reports the choice consequence', () => {
    const r = choose(s0, noEvents, 'a');
    expect(r.consequence).toMatchObject({
      card: 'decision',
      choiceId: 'a',
      lesson: 't:lesson.a',
      delayedQueued: 0,
      landed: [],
    });
    expect(r.consequence.scenarioId).toBeDefined();
    expect(r.state.seen).toEqual([r.consequence.scenarioId]);
    expect(r.state.lessons).toEqual(['t:lesson.a']);
    const r2 = choose(r.state, noEvents, 'a');
    expect(r2.state.lessons).toEqual(['t:lesson.a']);
    // Starter weeks hold DECISIONS_PER_WEEK.starter (2) pins: two choices finish week 1.
    expect(r2.state.week).toBe(1 + Math.floor(2 / DECISIONS_PER_WEEK.starter));
  });

  it('nextCard is a stable pure query', () => {
    let s: GameState = createGame('ravi', 'planner', 21, fixture);
    for (let i = 0; i < 40 && s.stage !== 'yearEnd'; i++) {
      const c1 = nextCard(s, fixture);
      const before = JSON.stringify(s);
      expect(nextCard(s, fixture)).toEqual(c1);
      expect(JSON.stringify(s)).toBe(before);
      s = choose(s, fixture, first(c1)).state;
    }
  });
});
