// Kirana Run: the convenience store's shopping mini-game. The player gets Ammi's list of needs
// and their own plan for the trip, then fills a basket from two shelves: needs (cheap, more
// sanity per rupee, +5 health each) and wants (cost more, more sanity each, less per rupee).
// Pure like the engine: the same seed always stocks the same shelves.
import { healthFor, sanityFor } from '../life/config';
import type { ShopKind } from '../life/types';
import { ITEMS } from './counter';
import type { ItemId } from './counter';
import { hash, shuffle } from './seed';

export type WantId = 'chocolates' | 'comics' | 'phone_cover' | 'tshirt' | 'earphones';

export interface ShelfItem {
  id: ItemId | WantId;
  kind: ShopKind;
  price: number; // whole rupees
  sanity: number;
  health: number;
}

const WANT_PRICES: readonly { id: WantId; price: number }[] = [
  { id: 'chocolates', price: 270 },
  { id: 'comics', price: 280 },
  { id: 'phone_cover', price: 300 },
  { id: 'tshirt', price: 350 },
  { id: 'earphones', price: 450 },
];

const shelfItem = (id: ShelfItem['id'], kind: ShopKind, price: number): ShelfItem => ({
  id,
  kind,
  price,
  sanity: sanityFor(kind, price),
  health: healthFor(kind),
});

/** Everything the store sells: the counter's groceries are the needs. */
export const NEEDS: readonly ShelfItem[] = ITEMS.map((it) => shelfItem(it.id, 'necessity', it.price));
export const WANTS: readonly ShelfItem[] = WANT_PRICES.map((w) => shelfItem(w.id, 'want', w.price));

export const LIST_SIZE = 3;
const NEEDS_ON_SHELF = 6;
const WANTS_ON_SHELF = 3;
/** Room in the plan beyond the list: enough for a spare need, not for a want. */
const PLAN_SLACK = 100;

export interface Trip {
  list: ItemId[];      // Ammi's list: needs to buy this trip
  plan: number;        // the trip's planned spend, whole rupees
  needs: ShelfItem[];  // the needs shelf (the list plus a few others)
  wants: ShelfItem[];  // the wants shelf
}

/** Stocks the shelves and writes the list for one trip. */
export function dealTrip(seed: number): Trip {
  const needs = shuffle(NEEDS, seed, 1).slice(0, NEEDS_ON_SHELF);
  const list = shuffle(needs, seed, 2)
    .slice(0, LIST_SIZE)
    .map((n) => n.id as ItemId);
  const listTotal = needs.filter((n) => list.includes(n.id as ItemId)).reduce((s, n) => s + n.price, 0);
  const plan = Math.ceil((listTotal + PLAN_SLACK) / 50) * 50;
  const wants = shuffle(WANTS, seed, 3).slice(0, WANTS_ON_SHELF);
  // Shelves in price order read like a real shop; the hash keeps ties stable.
  const byPrice = (a: ShelfItem, b: ShelfItem) => a.price - b.price || hash(seed, a.price) - hash(seed, b.price);
  return { list, plan, needs: [...needs].sort(byPrice), wants: [...wants].sort(byPrice) };
}

export interface Receipt {
  items: ShelfItem[];
  total: number;
  /** Rupees spent on each kind. */
  spent: Record<ShopKind, number>;
  sanity: number;
  health: number;
  /** List items not in the basket. */
  missing: ItemId[];
  listDone: boolean;
  withinPlan: boolean;
}

/** What a basket costs and gives. `basket` holds shelf item ids; unknown ids are ignored. */
export function checkout(trip: Trip, basket: readonly string[]): Receipt {
  const shelf = [...trip.needs, ...trip.wants];
  const items = shelf.filter((it) => basket.includes(it.id));
  const total = items.reduce((s, it) => s + it.price, 0);
  const spent = { necessity: 0, want: 0 };
  for (const it of items) spent[it.kind] += it.price;
  const missing = trip.list.filter((id) => !basket.includes(id));
  return {
    items,
    total,
    spent,
    sanity: items.reduce((s, it) => s + it.sanity, 0),
    health: items.reduce((s, it) => s + it.health, 0),
    missing,
    listDone: missing.length === 0,
    withinPlan: total <= trip.plan,
  };
}
