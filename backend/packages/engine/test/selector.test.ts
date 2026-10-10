import { describe, expect, it } from 'vitest';
import type { GameContent, GameState } from '@paisa/contracts';
import { EngineError } from '../src';
import { drawEvent } from '../src/events';
import { pickScenario } from '../src/selector';
import { content, quiet, scenario, variant, eventCard } from './fixtures';
import { start } from './helpers';

function stateFor(personaId: GameState['personaId'], level: number, patch: Partial<GameState> = {}): GameState {
  return { ...start(quiet, 'sana', 2).state, personaId, level, ...patch };
}

function picks(c: GameContent, s: GameState, n = 300): string[] {
  const out: string[] = [];
  for (let seed = 1; seed <= n; seed++) out.push(pickScenario(s, c, seed)[0].id);
  return out;
}

const decision = (pillar: GameState['decisions'][number]['pillar'], concept: string, rating?: 'best' | 'ok' | 'risky') => ({
  month: 1,
  week: 1,
  cardId: `x.${concept}.01`,
  cardKind: 'decision' as const,
  pillar,
  concept,
  choiceId: 'a',
  ...(rating ? { rating } : {}),
});

/** A level-1 investing scenario for ravi and sana, built from a fixture one. */
const investing = (() => {
  const s = scenario('budget.bus_pass.01');
  return { ...s, id: 'invest.basket.01', pillar: 'understand_investing' as const, concept: 'risk_return' };
})();

describe('scenario selector', () => {
  it('only serves scenarios written for the persona', () => {
    // Kiran has only the recharge scenario in the fixtures.
    expect(new Set(picks(content, stateFor('kiran', 3)))).toEqual(new Set(['budget.recharge.01']));
    expect(picks(content, stateFor('ravi', 3)).every((id) => id !== undefined)).toBe(true);
  });

  it('respects difficulty: level 1 never sees a level 2 card, level 2 does', () => {
    expect(picks(content, stateFor('ravi', 1)).includes('safe.loan_app.01')).toBe(false);
    expect(picks(content, stateFor('ravi', 2)).includes('safe.loan_app.01')).toBe(true);
  });

  it('holds back flag-gated scenarios until the flag is set', () => {
    const c = variant((x) => {
      x.scenarios.push({ ...scenario('safe.otp.01'), id: 'safe.followup.01', requiresFlag: 'shared_otp' });
    });
    expect(picks(c, stateFor('ravi', 2)).includes('safe.followup.01')).toBe(false);
    expect(picks(c, stateFor('ravi', 2, { flags: ['shared_otp'] })).includes('safe.followup.01')).toBe(true);
  });

  it('locks investing for a level 1 player until saving or budgeting is a habit', () => {
    const c = variant((x) => {
      x.scenarios.push(investing);
    });
    expect(picks(c, stateFor('ravi', 1)).includes('invest.basket.01')).toBe(false);
    const oneHabit = stateFor('ravi', 1, { decisions: [decision('plan_budget', 'a')] });
    expect(picks(c, oneHabit).includes('invest.basket.01')).toBe(false);
    // Two decisions in the two habit pillars together unlock it.
    const twoHabits = stateFor('ravi', 1, { decisions: [decision('plan_budget', 'a'), decision('save_manage', 'b')] });
    expect(picks(c, twoHabits).includes('invest.basket.01')).toBe(true);
    // Level 2 players are never locked.
    expect(picks(c, stateFor('ravi', 2)).includes('invest.basket.01')).toBe(true);
  });

  it('favors unseen cards over seen ones', () => {
    const c = variant((x) => {
      x.scenarios = [scenario('budget.recharge.01'), scenario('safe.otp.01')];
    });
    // otp is unseen (weight 5), recharge was seen long ago (weight 1).
    const s = stateFor('ravi', 1, { seen: ['budget.recharge.01', 'a.1', 'a.2', 'a.3'] });
    const ids = picks(c, s, 1000);
    const share = ids.filter((id) => id === 'safe.otp.01').length / ids.length;
    expect(share).toBeGreaterThan(0.7);
    expect(share).toBeLessThan(0.95);
  });

  it('serves more of a concept the player chose risky on', () => {
    const c = variant((x) => {
      x.scenarios = [scenario('budget.recharge.01'), scenario('safe.otp.01')];
    });
    const risky = [1, 2, 3].map(() => decision('plan_budget', 'needs_vs_wants', 'risky'));
    const ids = picks(c, stateFor('ravi', 1, { decisions: risky }), 2000);
    // Weights: recharge 1+4+2*3 = 11, otp 1+4 = 5, so 11/16.
    const share = ids.filter((id) => id === 'budget.recharge.01').length / ids.length;
    expect(share).toBeGreaterThan(0.63);
    expect(share).toBeLessThan(0.75);
  });

  it('skips the last three seen cards when others exist', () => {
    const s = stateFor('ravi', 1, { seen: ['x', 'budget.recharge.01'] });
    expect(picks(content, s).includes('budget.recharge.01')).toBe(false);
  });

  it('repeats a recent card when it is the only one eligible', () => {
    const s = stateFor('kiran', 1, { seen: ['budget.recharge.01'] });
    expect(new Set(picks(content, s, 20))).toEqual(new Set(['budget.recharge.01']));
  });

  it('relaxes difficulty rather than running dry, and throws no_cards when nothing fits', () => {
    const hard = variant((x) => {
      x.scenarios = [scenario('safe.loan_app.01')];
    });
    expect(pickScenario(stateFor('ravi', 1), hard, 1)[0].id).toBe('safe.loan_app.01');
    expect(() => pickScenario(stateFor('lakshmi', 1), content, 1)).toThrowError(EngineError);
    try {
      pickScenario(stateFor('lakshmi', 1), content, 1);
    } catch (e) {
      expect((e as EngineError).code).toBe('no_cards');
    }
  });

  it('is deterministic for a given rng state and consumes exactly one draw', () => {
    const s = stateFor('ravi', 2);
    const [a, ra] = pickScenario(s, content, 99);
    const [b, rb] = pickScenario(s, content, 99);
    expect(a.id).toBe(b.id);
    expect(ra).toBe(rb);
    expect(ra).not.toBe(99);
  });
});

describe('event deck', () => {
  it('filters by persona and level', () => {
    const s = stateFor('ravi', 1);
    for (let seed = 1; seed < 100; seed++) expect(drawEvent(s, content, seed)[0]?.id).toBe('event.screen_crack.01');
    const lvl = variant((c) => {
      c.events = c.events.map((e) => ({ ...e, levels: [3] }));
    });
    expect(drawEvent(stateFor('sana', 2), lvl, 5)[0]).toBeNull();
    expect(drawEvent(stateFor('sana', 3), lvl, 5)[0]).not.toBeNull();
  });

  it('draws nothing and leaves the rng alone when the deck is empty', () => {
    expect(drawEvent(stateFor('kiran', 2), content, 77)).toEqual([null, 77]);
  });

  it('weights the draw', () => {
    const s = stateFor('sana', 2);
    let crack = 0;
    for (let seed = 1; seed <= 2000; seed++) if (drawEvent(s, content, seed * 7919)[0]?.id === 'event.screen_crack.01') crack++;
    expect(crack / 2000).toBeGreaterThan(0.7);
    expect(crack / 2000).toBeLessThan(0.8);
  });

  it('avoids the last 8 events unless that leaves nothing', () => {
    const crackSeen = stateFor('sana', 2, { seen: ['event.screen_crack.01'] });
    for (let seed = 1; seed < 100; seed++) expect(drawEvent(crackSeen, content, seed)[0]?.id).toBe('event.bonus_tuition.01');
    const bothSeen = stateFor('sana', 2, { seen: ['event.screen_crack.01', 'event.bonus_tuition.01'] });
    expect(drawEvent(bothSeen, content, 3)[0]).not.toBeNull();
    // Older than 8 cards ago counts as fresh again.
    const old = stateFor('sana', 2, { seen: ['event.screen_crack.01', ...Array.from({ length: 8 }, (_, i) => `z.${i}`)] });
    const kinds = new Set<string>();
    for (let seed = 1; seed < 100; seed++) kinds.add(drawEvent(old, content, seed)[0]!.id);
    expect(kinds.has('event.screen_crack.01')).toBe(true);
  });

  it('keeps the event fixture shape the tests rely on', () => {
    expect(eventCard('event.bonus_tuition.01').personas).toEqual(['sana']);
  });
});
