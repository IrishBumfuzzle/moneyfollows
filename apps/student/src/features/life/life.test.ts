import { describe, expect, it } from 'vitest';
import { SCHOOL, SHOP, WORK } from './config';
import en from './content/en.json';
import hi from './content/hi.json';
import { localLifeApi as api, startVitals, toLifeEvent } from './life';
import type { LifeState } from './types';

const base: LifeState = {
  month: 1,
  week: 2,
  money: 1000,
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
    expect(delta).toEqual({ money: -SHOP.necessity.price, health: 0, sanity: SHOP.necessity.sanity });
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

describe('work', () => {
  it('pays the wage into the wallet and lowers sanity', () => {
    const { state, delta } = api.work(base);
    expect(state.money).toBe(1000 + WORK.wage);
    expect(delta).toEqual({ money: WORK.wage, health: 0, sanity: WORK.sanity });
    expect(state.earned).toEqual(['work:1:2']);
  });

  it('pays once per week, again the next week', () => {
    const worked = api.work(base).state;
    expect(api.work(worked).blocked).toBe('already_worked');
    expect(api.work({ ...worked, week: 3 }).blocked).toBeUndefined();
  });
});

describe('attendSchool', () => {
  it('lowers sanity, costs nothing, once per week', () => {
    const { state, delta } = api.attendSchool(base);
    expect(state.money).toBe(base.money);
    expect(delta).toEqual({ money: 0, health: 0, sanity: SCHOOL.sanity });
    expect(api.attendSchool(state).blocked).toBe('already_at_school');
  });
});

describe('rules', () => {
  it('meters stay within 0–100 and the delta reports the clamped change', () => {
    const high = { ...base, vitals: { health: 80, sanity: 98 } };
    const up = api.buy(high, 'want');
    expect(up.state.vitals.sanity).toBe(100);
    expect(up.delta.sanity).toBe(2);
    const low = { ...base, vitals: { health: 80, sanity: 3 } };
    const down = api.work(low);
    expect(down.state.vitals.sanity).toBe(0);
    expect(down.delta.sanity).toBe(-3);
  });

  it('never mutates its input and keeps extra GameState fields', () => {
    const frozen = deepFreeze({ ...base, seed: 7, rewindTokens: 3 });
    const a = api.buy(frozen, 'necessity').state;
    const b = api.work(a).state;
    const c = api.attendSchool(b).state;
    expect(c.seed).toBe(7);
    expect(c.rewindTokens).toBe(3);
  });

  it('is deterministic and JSON round-trips', () => {
    const run = () => api.attendSchool(api.work(api.buy(base, 'want').state).state).state;
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
    expect(toLifeEvent({ kind: 'work' }, base, api.work(base), ctx)!.payload.wage).toBe(WORK.wage);
    expect(toLifeEvent({ kind: 'school' }, base, api.attendSchool(base), ctx)!.type).toBe('school_attended');
    // push_events keeps only numbers and id-like strings (^[A-Za-z0-9_.:-]{1,64}$).
    for (const v of Object.values(buy.payload)) {
      expect(typeof v === 'number' || /^[A-Za-z0-9_.:-]{1,64}$/.test(v)).toBe(true);
    }
  });

  it('sends nothing for a blocked action', () => {
    const worked = api.work(base).state;
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
