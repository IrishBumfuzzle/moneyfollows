import { describe, expect, it } from 'vitest';
import { NEED_HEALTH } from '../life/config';
import { STRINGS } from './content';
import { LIST_SIZE, NEEDS, WANTS, checkout, dealTrip } from './kirana';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);
const rate = (it: { sanity: number; price: number }) => it.sanity / it.price;

describe('shelf rules', () => {
  it('wants cost more than any need and lift sanity more each', () => {
    const maxNeed = Math.max(...NEEDS.map((n) => n.price));
    const minWant = Math.min(...WANTS.map((w) => w.price));
    expect(minWant).toBeGreaterThan(maxNeed);
    expect(Math.min(...WANTS.map((w) => w.sanity))).toBeGreaterThan(Math.max(...NEEDS.map((n) => n.sanity)));
  });

  it('every need gives more sanity per rupee than every want', () => {
    const worstNeed = Math.min(...NEEDS.map(rate));
    const bestWant = Math.max(...WANTS.map(rate));
    expect(worstNeed).toBeGreaterThan(bestWant);
  });

  it('every need gives +5 health; wants give none', () => {
    for (const n of NEEDS) expect(n.health).toBe(NEED_HEALTH);
    for (const w of WANTS) expect(w.health).toBe(0);
  });
});

describe('dealTrip', () => {
  it('is deterministic', () => {
    expect(dealTrip(9)).toEqual(dealTrip(9));
  });

  it('puts every list item on the needs shelf, and a want always breaks the plan', () => {
    for (const seed of SEEDS) {
      const trip = dealTrip(seed);
      expect(trip.list).toHaveLength(LIST_SIZE);
      expect(new Set(trip.list).size).toBe(LIST_SIZE);
      for (const id of trip.list) expect(trip.needs.map((n) => n.id)).toContain(id);
      expect(trip.needs.every((n) => n.kind === 'necessity')).toBe(true);
      expect(trip.wants.every((w) => w.kind === 'want')).toBe(true);
      const list = checkout(trip, trip.list);
      expect(list.withinPlan).toBe(true);
      expect(checkout(trip, [...trip.list, trip.wants[0]!.id]).withinPlan).toBe(false);
    }
  });
});

describe('checkout', () => {
  const trip = dealTrip(42);
  const want = trip.wants[0]!;

  it('adds up money, sanity and health, and splits the spend by kind', () => {
    const r = checkout(trip, [...trip.list, want.id]);
    const needs = trip.needs.filter((n) => trip.list.includes(n.id as never));
    expect(r.total).toBe(needs.reduce((s, n) => s + n.price, 0) + want.price);
    expect(r.spent.want).toBe(want.price);
    expect(r.spent.necessity).toBe(r.total - want.price);
    expect(r.sanity).toBe(needs.reduce((s, n) => s + n.sanity, 0) + want.sanity);
    expect(r.health).toBe(LIST_SIZE * NEED_HEALTH);
    expect(r.listDone).toBe(true);
  });

  it('lists what was missed from the list', () => {
    const r = checkout(trip, [want.id]);
    expect(r.missing).toEqual(trip.list);
    expect(r.listDone).toBe(false);
    expect(r.health).toBe(0);
  });

  it('ignores ids not on the shelves', () => {
    expect(checkout(trip, ['gold_bar']).total).toBe(0);
  });
});

describe('shop strings', () => {
  it('names every item on the shelves', () => {
    for (const it of [...NEEDS, ...WANTS]) expect(STRINGS.en![`store.item.${it.id}`], it.id).toBeDefined();
  });
});
