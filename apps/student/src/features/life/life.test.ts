import { describe, expect, it } from 'vitest';
import { DAYS_PER_WEEK, NEED_HEALTH, REST, SCHOOL, SHOP, VITALS_MAX, WORK } from './config';
import en from './content/en.json';
import hi from './content/hi.json';
import { localLifeApi as api, nextDay, startVitals, toLifeEvent } from './life';
import type { LifeState } from './types';

const base: LifeState = {
  month: 1,
  week: 2,
  day: 3,
  money: 1000,
  debt: 0,
  flags: [],
  earned: [],
  vitals: startVitals(),
};

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

const ctx = { event_id: 'e1', anon_id: 'a1', class_id: 'c1', client_ts: '2026-10-10T16:30:00.000Z' };

describe('config', () => {
  it('necessities cost less and lift sanity less than wants; work and school lower sanity', () => {
    expect(SHOP.necessity.price).toBeLessThan(SHOP.want.price);
    expect(SHOP.necessity.sanity).toBeGreaterThan(0);
    expect(SHOP.want.sanity).toBeGreaterThan(SHOP.necessity.sanity);
    // ...but needs give more sanity per rupee, and keep you healthy.
    expect(SHOP.necessity.sanity / SHOP.necessity.price).toBeGreaterThan(SHOP.want.sanity / SHOP.want.price);
    expect(SHOP.necessity.health).toBe(NEED_HEALTH);
    expect(SHOP.want.health).toBe(0);
    expect(WORK.sanity).toBeLessThan(0);
    expect(SCHOOL.sanity).toBeLessThan(0);
  });
});

describe('buy', () => {
  it('a necessity spends from the wallet and lifts sanity slightly', () => {
    const { state, delta, blocked } = api.buy(base, 'necessity');
    expect(blocked).toBeUndefined();
    expect(state.money).toBe(1000 - SHOP.necessity.price);
    expect(state.vitals.sanity).toBe(base.vitals.sanity + SHOP.necessity.sanity);
    expect(delta).toEqual({ money: -SHOP.necessity.price, health: NEED_HEALTH, sanity: SHOP.necessity.sanity });
  });

  it('a want spends from the same wallet and lifts sanity a lot', () => {
    const { state, delta } = api.buy(base, 'want');
    expect(state.money).toBe(1000 - SHOP.want.price);
    expect(delta.sanity).toBe(SHOP.want.sanity);
  });

  it('is blocked when the wallet cannot pay, and returns the same state', () => {
    const poor = { ...base, money: SHOP.want.price - 1 };
    const out = api.buy(poor, 'want');
    expect(out.blocked).toBe('not_enough_money');
    expect(out.state).toBe(poor);
    expect(out.delta).toEqual({ money: 0, health: 0, sanity: 0 });
  });

  it('can be repeated while money lasts', () => {
    const once = api.buy(base, 'necessity').state;
    expect(api.buy(once, 'necessity').state.money).toBe(1000 - 2 * SHOP.necessity.price);
  });
});

// Work needs school first that day.
const schooled = api.attendSchool(base).state;

describe('work', () => {
  it('pays the wage into the wallet and lowers sanity', () => {
    const { state, delta } = api.work(schooled);
    expect(state.money).toBe(1000 + WORK.wage);
    expect(delta).toEqual({ money: WORK.wage, health: 0, sanity: WORK.sanity });
    expect(state.earned).toEqual(['work:1:2:3']);
  });

  it('only after school that day', () => {
    expect(api.work(base).blocked).toBe('school_first');
    expect(api.work(base).state).toBe(base);
  });

  it('pays once a day, and again the next day after school', () => {
    const worked = api.work(schooled).state;
    expect(api.work(worked).blocked).toBe('already_worked');
    const tomorrow = api.rest(worked).state;
    expect(api.work(tomorrow).blocked).toBe('school_first');
    expect(api.work(api.attendSchool(tomorrow).state).blocked).toBeUndefined();
  });
});

describe('rest', () => {
  it('brings back some health and sanity and moves to the next day', () => {
    const low = { ...base, vitals: { health: 10, sanity: 5 } };
    const { state, delta } = api.rest(low);
    expect(delta).toEqual({ money: 0, health: REST.health, sanity: REST.sanity });
    expect([state.month, state.week, state.day]).toEqual([1, 2, 4]);
    expect(state.vitals).toEqual({ health: 10 + REST.health, sanity: 5 + REST.sanity });
  });

  it('never goes past the top of the meters', () => {
    const full = { ...base, vitals: { health: VITALS_MAX, sanity: VITALS_MAX - 1 } };
    expect(api.rest(full).state.vitals).toEqual({ health: VITALS_MAX, sanity: VITALS_MAX });
  });

  it('rolls day 7 into the next week, and week 4 into the next month', () => {
    expect(nextDay({ month: 1, week: 2, day: 3 })).toEqual({ month: 1, week: 2, day: 4 });
    expect(nextDay({ month: 1, week: 2, day: DAYS_PER_WEEK })).toEqual({ month: 1, week: 3, day: 1 });
    expect(nextDay({ month: 1, week: 4, day: DAYS_PER_WEEK })).toEqual({ month: 2, week: 1, day: 1 });
  });
});

describe('attendSchool', () => {
  it('lowers sanity, costs nothing, once a day', () => {
    const { state, delta } = api.attendSchool(base);
    expect(state.money).toBe(base.money);
    expect(delta).toEqual({ money: 0, health: 0, sanity: SCHOOL.sanity });
    expect(api.attendSchool(state).blocked).toBe('already_at_school');
  });
});

describe('rules', () => {
  it('meters stay within 0–25 and the delta reports the clamped change', () => {
    const high = { ...base, vitals: { health: 20, sanity: VITALS_MAX - 2 } };
    const up = api.buy(high, 'want');
    expect(up.state.vitals.sanity).toBe(VITALS_MAX);
    expect(up.delta.sanity).toBe(2);
    const low = { ...schooled, vitals: { health: 20, sanity: 3 } };
    const down = api.work(low);
    expect(down.state.vitals.sanity).toBe(0);
    expect(down.delta.sanity).toBe(-3);
  });

  it('never mutates its input and keeps extra GameState fields', () => {
    const frozen = deepFreeze({ ...base, seed: 7, rewindTokens: 3 });
    const a = api.buy(frozen, 'necessity').state;
    const b = api.attendSchool(a).state;
    const c = api.rest(api.work(b).state).state;
    expect(c.seed).toBe(7);
    expect(c.rewindTokens).toBe(3);
  });

  it('is deterministic and JSON round-trips', () => {
    const run = () => api.rest(api.work(api.attendSchool(api.buy(base, 'want').state).state).state).state;
    expect(run()).toEqual(run());
    expect(JSON.parse(JSON.stringify(run()))).toEqual(run());
  });

  it('shopOffers marks what the wallet can afford', () => {
    const offers = api.shopOffers({ ...base, money: SHOP.want.price - 1 });
    expect(offers.map((o) => [o.kind, o.affordable])).toEqual([
      ['necessity', true],
      ['want', false],
    ]);
  });
});

describe('toLifeEvent', () => {
  it('builds one event per successful action with backend-safe values', () => {
    const buy = toLifeEvent({ kind: 'buy', shop: 'want' }, base, api.buy(base, 'want'), ctx)!;
    expect(buy.type).toBe('shop_purchase');
    expect(buy.payload).toEqual({ month: 1, week: 2, health: 0, sanity: SHOP.want.sanity, kind: 'want', price: SHOP.want.price });
    expect(toLifeEvent({ kind: 'work' }, schooled, api.work(schooled), ctx)!.payload.wage).toBe(WORK.wage);
    expect(toLifeEvent({ kind: 'school' }, base, api.attendSchool(base), ctx)!.type).toBe('school_attended');
    // push_events keeps only numbers and id-like strings (^[A-Za-z0-9_.:-]{1,64}$).
    for (const v of Object.values(buy.payload)) {
      expect(typeof v === 'number' || /^[A-Za-z0-9_.:-]{1,64}$/.test(v)).toBe(true);
    }
  });

  it('sends nothing for a blocked action', () => {
    const worked = api.work(schooled).state;
    expect(toLifeEvent({ kind: 'work' }, worked, api.work(worked), ctx)).toBeNull();
  });
});

describe('content', () => {
  it('every life key exists in en and hi, and every config key has a string', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    for (const o of Object.values(SHOP)) {
      for (const k of [o.label, o.hint]) expect(en).toHaveProperty([k.slice(2)]);
    }
  });
});

describe('applyEffects and repay (events, phone threads)', () => {
  it("'block' refuses a spend the wallet can't cover; 'all' takes the wallet to zero, never below", () => {
    const poor = { ...base, money: 100 };
    expect(api.applyEffects(poor, { money: -600, health: 25 }).blocked).toBe('not_enough_money');
    const scam = api.applyEffects(poor, { money: -500, sanity: -10 }, 'all');
    expect(scam.state.money).toBe(0);
    expect(scam.delta).toEqual({ money: -100, health: 0, sanity: -10 });
  });

  it('borrowing adds debt; health and sanity clamp; earning adds money', () => {
    const out = api.applyEffects({ ...base, vitals: { health: 20, sanity: 18 } }, { debt: 600, health: 13, sanity: -3 });
    expect(out.state).toMatchObject({ money: 1000, debt: 600, vitals: { health: VITALS_MAX, sanity: 15 } });
    expect(out.delta).toEqual({ money: 0, health: 5, sanity: -3, debt: 600 });
    expect(api.applyEffects(base, { money: 300 }).state.money).toBe(1300);
  });

  it('repay pays back what the wallet allows, and is blocked with no debt or no money', () => {
    expect(api.repay({ ...base, debt: 600 }).state).toMatchObject({ money: 400, debt: 0 });
    expect(api.repay({ ...base, money: 250, debt: 600 }).state).toMatchObject({ money: 0, debt: 350 });
    expect(api.repay(base).blocked).toBe('no_debt');
    expect(api.repay({ ...base, money: 0, debt: 50 }).blocked).toBe('not_enough_money');
  });

  it('never mutates its input', () => {
    const frozen = deepFreeze({ ...base, debt: 100 });
    expect(() => api.repay(api.applyEffects(frozen, { money: -50, debt: 200 }).state)).not.toThrow();
  });
});
