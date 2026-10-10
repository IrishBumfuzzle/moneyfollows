// Tunable numbers for the life actions. Stand-in for BE-1's packages/content/life.json
// (docs/life-meters-api.md §3); move it there unchanged when the engine takes over.
import type { IconId, ShopKind, TKey, Vitals } from './types';

export const LIFE_CONTENT_VERSION = 'life-2026-10-10';

// Both meters are out of 25, so every hit matters. Every effect below is sized for that.
export const VITALS_MIN = 0;
export const VITALS_MAX = 25;
export const START_VITALS: Vitals = { health: 20, sanity: 18 };

// The calendar: resting at home ends the day; 7 days make a week, 4 weeks a month.
export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_MONTH = 4;
// Placeholder until the persona's starting money comes from packages/content/personas.json
// (Sana's starting jars add up to ₹2,000).
export const START_MONEY = 2000;

export interface ShopOption {
  label: TKey;
  hint: TKey;
  icon: IconId;
  price: number;
  health: number;
  sanity: number;
}

// Satisfaction scales with what you spend. Needs give more sanity per rupee; wants cost more,
// so each one lifts sanity more, but at a lower rate per rupee. Needs also keep you healthy.
export const SANITY_PER_100: Record<ShopKind, number> = { necessity: 2, want: 1.5 };
export const NEED_HEALTH = 3;
/**
 * Sanity an item of this kind and price gives: whole points, at least 1. Needs round up and
 * wants round down, so every need's rate per rupee stays above every want's.
 */
export const sanityFor = (kind: ShopKind, price: number) => {
  const exact = (price * SANITY_PER_100[kind]) / 100;
  return Math.max(1, kind === 'necessity' ? Math.ceil(exact) : Math.floor(exact));
};
export const healthFor = (kind: ShopKind) => (kind === 'necessity' ? NEED_HEALTH : 0);

// Both options spend from the one common wallet, by the rates above.
export const SHOP: Record<ShopKind, ShopOption> = {
  necessity: {
    label: 't:life.shop.necessity.label',
    hint: 't:life.shop.necessity.hint',
    icon: 'sack',
    price: 100,
    health: healthFor('necessity'),
    sanity: sanityFor('necessity', 100),
  },
  want: {
    label: 't:life.shop.want.label',
    hint: 't:life.shop.want.hint',
    icon: 'headphones',
    price: 400,
    health: healthFor('want'),
    sanity: sanityFor('want', 400),
  },
};

// School, then work, at most once each a day: both cost sanity. Resting at home brings some back.
export const WORK = { wage: 100, health: 0, sanity: -4 };
export const SCHOOL = { health: 0, sanity: -3 };
export const REST = { health: 2, sanity: 6 };
