// Tunable numbers for the life actions. Stand-in for BE-1's packages/content/life.json
// (docs/life-meters-api.md §3); move it there unchanged when the engine takes over.
import type { IconId, ShopKind, TKey, Vitals } from './types';

export const LIFE_CONTENT_VERSION = 'life-2026-10-10';

export const VITALS_MIN = 0;
export const VITALS_MAX = 100;
export const START_VITALS: Vitals = { health: 80, sanity: 70 };
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
export const SANITY_PER_100: Record<ShopKind, number> = { necessity: 4, want: 3 };
export const NEED_HEALTH = 5;
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

// Work and school both cost sanity. Each can be done once per week.
export const WORK = { wage: 200, health: 0, sanity: -8 };
export const SCHOOL = { health: 0, sanity: -5 };
