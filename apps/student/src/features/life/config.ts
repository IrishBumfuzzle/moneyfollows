// Tunable numbers for the life actions. Stand-in for BE-1's packages/content/life.json
// (docs/life-meters-api.md §3); move it there unchanged when the engine takes over.
import type { ShopKind, TKey, Vitals } from './types';

export const LIFE_CONTENT_VERSION = 'life-2026-10-10';

export const VITALS_MIN = 0;
export const VITALS_MAX = 100;
export const START_VITALS: Vitals = { health: 80, sanity: 70 };

export interface ShopOption {
  label: TKey;
  hint: TKey;
  icon: string;
  price: number;
  health: number;
  sanity: number;
}

// Both options spend from the one common wallet. Necessities cost little and lift sanity a
// little; wants cost a lot and lift it a lot.
export const SHOP: Record<ShopKind, ShopOption> = {
  necessity: {
    label: 't:life.shop.necessity.label',
    hint: 't:life.shop.necessity.hint',
    icon: '🍚',
    price: 100,
    health: 0,
    sanity: 3,
  },
  want: {
    label: 't:life.shop.want.label',
    hint: 't:life.shop.want.hint',
    icon: '🎧',
    price: 400,
    health: 0,
    sanity: 12,
  },
};

// Work and school both cost sanity. Each can be done once per week.
export const WORK = { wage: 200, health: 0, sanity: -8 };
export const SCHOOL = { health: 0, sanity: -5 };
