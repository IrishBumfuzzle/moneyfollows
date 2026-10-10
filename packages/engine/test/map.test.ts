import { describe, expect, it } from 'vitest';
import { CONTINUE, DECISIONS_PER_WEEK, GameStateSchema, JARS, LEVELS, WEEKS_PER_MONTH } from '@paisa/shared';
import type { ContentBundle, GameState, LocationId } from '@paisa/shared';
import { content as bundled } from '@paisa/content';
import {
  EngineError,
  choose,
  createDemoGame,
  createGame,
  earn,
  nextCard,
  pinsForWeek,
  playAt,
  rewind,
  sleep,
  sleepStep,
} from '../src';
import { hash } from '../src/hash';
import { bundle, choice, deepFreeze, event, fixture, scenario, withState } from './fixtures';

const noEvents = bundle({ events: [] });
const places: LocationId[] = ['home', 'convenience', 'school', 'hospital', 'bank'];
/** Fixture content spread over the five places, so the place preference has something to do. */
const spread = bundle({
  events: [],
  scenarios: Array.from({ length: 10 }, (_, i) =>
    scenario(`spread.s${i}`, {
      location: places[i % places.length]!,
      ...(i === 1 ? { sublocation: 'convenience.kirana' } : {}),
    }),
  ),
});

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : 'not an EngineError';
  }
  return undefined;
};

/** Plays every pin this week through the map loop, in the given order, with the first choice. */
function playWeek(s: GameState, c: ContentBundle, order: (n: number) => number[] = (n) => [...Array(n).keys()]) {
  const pins = pinsForWeek(s, c);
  for (const i of order(pins.length)) {
    const pin = pins[i]!;
    const card = playAt(s, c, pin.location, pin.sublocation)!;
    expect(card.kind === 'decision' || card.kind === 'event').toBe(true);
    if (card.kind !== 'decision' && card.kind !== 'event') throw new Error('unexpected card');
    s = choose(s, c, card.scenario.choices[0]!.id, { scenarioId: pin.scenarioId }).state;
  }
  return s;
}

describe('weekly pins (5.8)', () => {
  it('pins DECISIONS_PER_WEEK decisions plus an optional event: 2 to 4 pins, all different cards', () => {
    for (const level of LEVELS)
      for (let seed = 0; seed < 100; seed++) {
        const s = createGame('sana', level, seed, bundled);
        const pins = s.pins!;
        const decisions = pins.filter((p) => p.kind === 'decision');
        expect(decisions).toHaveLength(DECISIONS_PER_WEEK[level]);
        expect(pins.length).toBeGreaterThanOrEqual(2);
        expect(pins.length).toBeLessThanOrEqual(4);
        expect(new Set(pins.map((p) => p.scenarioId)).size).toBe(pins.length);
        // the surprise event, when there is one, comes first and sets the stage
        const events = pins.filter((p) => p.kind === 'event');
        expect(events.length).toBeLessThanOrEqual(1);
        if (events.length === 1) {
          expect(pins[0]!.kind).toBe('event');
          expect(s.stage).toBe('event');
        } else expect(s.stage).toBe('decision');
      }
  });

  it("puts the week's decisions at different places when the content allows it", () => {
    for (let seed = 0; seed < 100; seed++) {
      const pins = createGame('sana', 'planner', seed, spread).pins!;
      expect(new Set(pins.map((p) => p.location)).size).toBe(pins.length);
    }
  });

  it('pin places and sublocations come from the cards', () => {
    for (let seed = 0; seed < 50; seed++)
      for (const pin of createGame('ravi', 'explorer', seed, bundled).pins!) {
        const card = [...bundled.scenarios, ...bundled.events].find((c) => c.id === pin.scenarioId)!;
        expect(pin.location).toBe(card.location);
        expect(pin.sublocation).toBe(card.sublocation);
      }
  });

  it('pinsForWeek lists the unplayed pins, and nothing at month end', () => {
    const s0 = createGame('sana', 'explorer', 3, noEvents);
    const all = pinsForWeek(s0, noEvents);
    expect(all).toHaveLength(3);
    const first = all[1]!;
    const s1 = choose(s0, noEvents, 'a', { scenarioId: first.scenarioId }).state;
    expect(pinsForWeek(s1, noEvents).map((p) => p.scenarioId)).toEqual(
      all.filter((p) => p !== first).map((p) => p.scenarioId),
    );
    let atEnd = s0;
    for (let w = 0; w < WEEKS_PER_MONTH; w++) atEnd = sleep(playWeek(atEnd, noEvents), noEvents);
    expect(atEnd.stage).toBe('monthEnd');
    expect(pinsForWeek(atEnd, noEvents)).toEqual([]);
  });
});

describe('playAt', () => {
  const s = createGame('sana', 'planner', 0, spread);

  it('returns the pinned card at a place, or null', () => {
    for (const pin of pinsForWeek(s, spread)) {
      const card = playAt(s, spread, pin.location, pin.sublocation);
      expect(card && card.kind === 'decision' && card.scenario.id).toBe(pin.scenarioId);
    }
    const unpinned = places.find((p) => !pinsForWeek(s, spread).some((x) => x.location === p));
    if (unpinned) expect(playAt(s, spread, unpinned)).toBeNull();
  });

  it('a sub-map location matches only its own pins; the place matches pins inside its sub-map too', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i).find((i) =>
      createGame('sana', 'planner', i, spread).pins!.some((p) => p.sublocation === 'convenience.kirana'),
    )!;
    const k = createGame('sana', 'planner', seed, spread);
    const at = (sub?: string) => {
      const card = playAt(k, spread, 'convenience', sub);
      return card && card.kind === 'decision' ? card.scenario.id : null;
    };
    expect(at('convenience.kirana')).toBe('spread.s1');
    expect(at()).not.toBeNull();
    expect(at('convenience.phone_shop')).toBeNull();
  });

  it('is a pure query', () => {
    const frozen = deepFreeze(structuredClone(s));
    const before = JSON.stringify(frozen);
    playAt(frozen, spread, 'home');
    pinsForWeek(frozen, spread);
    expect(JSON.stringify(frozen)).toBe(before);
  });
});

describe('the map loop: choose a pin, then sleep', () => {
  it('plays pins in any order; the week only ends with sleep', () => {
    const s0 = createGame('ravi', 'planner', 8, spread);
    const s1 = playWeek(s0, spread, (n) => [...Array(n).keys()].reverse());
    expect([s1.month, s1.week]).toEqual([1, 1]);
    expect(pinsForWeek(s1, spread)).toEqual([]);
    expect(errorCode(() => nextCard(s1, spread))).toBe('sleep_required');
    expect(errorCode(() => choose(s1, spread, 'a'))).toBe('sleep_required');
    const s2 = sleep(s1, spread);
    expect([s2.month, s2.week]).toEqual([1, 2]);
    expect(pinsForWeek(s2, spread)).toHaveLength(DECISIONS_PER_WEEK.planner);
  });

  it('rule 8: sleep is blocked while any pin is unplayed', () => {
    const s0 = createGame('sana', 'starter', 2, noEvents);
    expect(errorCode(() => sleep(s0, noEvents))).toBe('pins_remaining');
    const one = choose(s0, noEvents, 'a', { scenarioId: s0.pins![0]!.scenarioId }).state;
    expect(errorCode(() => sleep(one, noEvents))).toBe('pins_remaining');
    expect(errorCode(() => sleepStep(one, noEvents))).toBe('pins_remaining');
    const done = choose(one, noEvents, 'a', { scenarioId: s0.pins![1]!.scenarioId }).state;
    expect(sleep(done, noEvents).week).toBe(2);
  });

  it('refuses a target that is not an unplayed pin', () => {
    const s0 = createGame('sana', 'starter', 2, noEvents);
    expect(errorCode(() => choose(s0, noEvents, 'a', { scenarioId: 'not.pinned' }))).toBe('not_pinned');
    const id = s0.pins![0]!.scenarioId;
    const once = choose(s0, noEvents, 'a', { scenarioId: id }).state;
    expect(errorCode(() => choose(once, noEvents, 'a', { scenarioId: id }))).toBe('not_pinned');
  });

  it('sleep after week 4 opens the month-end report; sleep there starts the next month with payday', () => {
    let s = createGame('sana', 'explorer', 4, noEvents);
    for (let w = 1; w <= WEEKS_PER_MONTH; w++) s = sleep(playWeek(s, noEvents), noEvents);
    expect(s.stage).toBe('monthEnd');
    expect(s.scores).toHaveLength(1);
    expect(nextCard(s, noEvents).kind).toBe('monthEnd');
    const r = sleepStep(s, noEvents);
    expect(r.payday?.income).toBe(8000);
    expect(r.state).toMatchObject({ month: 2, week: 1, rewindTokens: 3, history: [] });
    expect(r.state).toEqual(choose(s, noEvents, CONTINUE).state);
  });

  it('sleepStep reports delayed effects that land overnight', () => {
    const delayed = bundle({
      events: [],
      scenarios: [
        scenario('late.a', {
          choices: [
            choice('a', {}, { delayed: [{ afterWeeks: 1, effects: { jars: { savings: 70 } }, note: 't:note.late' }] }),
            choice('b'),
          ],
        }),
        scenario('late.b'),
      ],
    });
    const s0 = createGame('sana', 'starter', 1, delayed);
    const s1 = playWeek(s0, delayed);
    const r = sleepStep(s1, delayed);
    expect(r.landed.map((l) => l.note)).toContain('t:note.late');
    expect(r.state.jars.savings - s1.jars.savings).toBe(70);
    expect(r.state).toEqual(sleep(s1, delayed));
  });

  it('runs a whole game to yearEnd; sleep then is game over', () => {
    let s = createGame('ravi', 'starter', 5, bundled);
    for (let i = 0; i < 100 && s.stage !== 'yearEnd'; i++)
      s = s.stage === 'monthEnd' ? sleep(s, bundled) : sleep(playWeek(s, bundled), bundled);
    expect(s.stage).toBe('yearEnd');
    expect(s.scores).toHaveLength(3);
    expect(errorCode(() => sleep(s, bundled))).toBe('game_over');
    expect(GameStateSchema.safeParse(s).success).toBe(true);
  });

  it('is deterministic and never mutates its input', () => {
    const run = () => {
      let s = deepFreeze(createGame('sana', 'planner', 77, spread));
      for (let w = 0; w < 6; w++) {
        if (s.stage === 'monthEnd') s = deepFreeze(sleep(s, spread));
        s = deepFreeze(sleep(deepFreeze(playWeek(s, spread, (n) => [...Array(n).keys()].reverse())), spread));
      }
      return s;
    };
    expect(run()).toEqual(run());
  });

  it('rewind undoes the last pin, which can then be played again', () => {
    const s0 = createGame('sana', 'starter', 6, noEvents);
    const id = s0.pins![1]!.scenarioId;
    const s1 = choose(s0, noEvents, 'b', { scenarioId: id }).state;
    const back = rewind(s1)!;
    expect(back).toEqual({ ...s0, rewindTokens: s0.rewindTokens - 1 });
    expect(pinsForWeek(back, noEvents)).toHaveLength(2);
  });

  it('an older save without pins gets the same pins back', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = createGame('sana', 'explorer', seed, fixture);
      const old = withState(s, {});
      expect(old.pins).toBeUndefined();
      expect(pinsForWeek(old, fixture)).toEqual(pinsForWeek(s, fixture));
      const card = nextCard(old, fixture);
      expect(card).toEqual(nextCard(s, fixture));
      if (card.kind !== 'decision' && card.kind !== 'event') throw new Error('unexpected');
      // Same game from here on; only the rewind snapshot differs (it is the older save itself).
      const fromOld = choose(old, fixture, card.scenario.choices[0]!.id).state;
      const fromNew = choose(s, fixture, card.scenario.choices[0]!.id).state;
      expect({ ...fromOld, history: [] }).toEqual({ ...fromNew, history: [] });
    }
  });
});

describe('rule 7: earn is idempotent', () => {
  const s0 = createGame('sana', 'starter', 1, noEvents);

  it('pays once per sourceId, into Wants unless a jar is named', () => {
    const s1 = earn(s0, 60, 'news:2026-W41:upi_fraud');
    expect(s1.jars.wants - s0.jars.wants).toBe(60);
    expect(s1.earned).toEqual(['news:2026-W41:upi_fraud']);
    const again = earn(s1, 60, 'news:2026-W41:upi_fraud');
    expect(again).toBe(s1);
    const other = earn(s1, 30, 'news:2026-W41:inflation', 'savings');
    expect(other.jars.savings - s1.jars.savings).toBe(30);
    expect(other.earned).toEqual(['news:2026-W41:upi_fraud', 'news:2026-W41:inflation']);
    expect(other.goal.progress).toBe(other.jars.goals);
  });

  it('a zero wage still records the source, so a later retry cannot pay', () => {
    const zero = earn(s0, 0, 'news:x');
    expect(zero.jars).toEqual(s0.jars);
    expect(earn(zero, 50, 'news:x')).toBe(zero);
  });

  it('rejects bad amounts and ids, and is game over at yearEnd', () => {
    expect(errorCode(() => earn(s0, -1, 'x'))).toBe('invalid_earn');
    expect(errorCode(() => earn(s0, 1.5, 'x'))).toBe('invalid_earn');
    expect(errorCode(() => earn(s0, Number.NaN, 'x'))).toBe('invalid_earn');
    expect(errorCode(() => earn(s0, 5, ''))).toBe('invalid_earn');
    expect(errorCode(() => earn({ ...s0, stage: 'yearEnd' }, 5, 'x'))).toBe('game_over');
  });

  it('never mutates its input and round-trips through JSON', () => {
    const frozen = deepFreeze(structuredClone(s0));
    const s1 = earn(frozen, 25, 'news:a');
    expect(frozen.earned).toEqual([]);
    expect(JSON.parse(JSON.stringify(s1))).toEqual(s1);
    expect(GameStateSchema.safeParse(s1).success).toBe(true);
  });

  it('a rewind past an earn undoes the wage and its id together', () => {
    const card = nextCard(s0, noEvents);
    if (card.kind !== 'decision') throw new Error('unexpected');
    const paid = earn(s0, 40, 'news:b');
    const after = choose(paid, noEvents, 'a').state;
    const back = rewind(after)!;
    expect(back.jars).toEqual(paid.jars);
    expect(back.earned).toEqual(['news:b']);
  });
});

describe('money conservation in the map loop', () => {
  const net = (s: GameState): number => JARS.reduce((sum, j) => sum + s.jars[j], 0) - s.debt;

  it('earn adds exactly its wage once; sleep changes money only by what it reports', () => {
    for (let seed = 0; seed < 30; seed++) {
      let s = createGame(seed % 2 ? 'ravi' : 'sana', LEVELS[seed % 3]!, seed, fixture);
      let earnedTotal = 0;
      for (let i = 0; i < 60 && s.stage !== 'yearEnd'; i++) {
        if (s.stage === 'monthEnd' || pinsForWeek(s, fixture).length === 0) {
          const r = sleepStep(s, fixture);
          let expected = r.landed.reduce(
            (sum, l) => sum + JARS.reduce((t, j) => t + (l.applied.jars[j] ?? 0), 0) - l.applied.debt,
            0,
          );
          if (r.payday)
            expected += JARS.reduce((t, j) => t + (r.payday!.applied.jars[j] ?? 0), 0) - r.payday.applied.debt;
          expect(net(r.state) - net(s)).toBe(expected);
          s = r.state;
          continue;
        }
        // a wage between pins: sometimes a repeat of an earlier source, which must pay nothing
        const source = `news:${seed}:${hash(seed, 'src', i) % 4}`;
        const wage = 10 + (hash(seed, 'wage', i) % 50);
        const paidBefore = s.earned.includes(source);
        const e = earn(s, wage, source);
        expect(net(e) - net(s)).toBe(paidBefore ? 0 : wage);
        if (!paidBefore) earnedTotal += wage;
        s = e;
        const pin = pinsForWeek(s, fixture)[0]!;
        const card = playAt(s, fixture, pin.location, pin.sublocation)!;
        if (card.kind !== 'decision' && card.kind !== 'event') throw new Error('unexpected');
        s = choose(s, fixture, card.scenario.choices[0]!.id, { scenarioId: pin.scenarioId }).state;
      }
      expect(new Set(s.earned).size).toBe(s.earned.length);
      expect(earnedTotal).toBeGreaterThan(0);
    }
  });
});

describe('demo save', () => {
  it('is a mid-month map-loop state with pins to play', () => {
    const demo = createDemoGame();
    expect([demo.month, demo.week]).toEqual([2, 2]);
    expect(pinsForWeek(demo, bundled).length).toBeGreaterThan(0);
    expect(demo.earned).toEqual([]);
    expect(GameStateSchema.safeParse(demo).success).toBe(true);
  });
});

// keep the event fixture builder referenced for content with events
void event;
