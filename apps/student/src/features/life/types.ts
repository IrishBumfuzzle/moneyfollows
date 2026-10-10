// Life meters: money, health and sanity (docs/life-meters-api.md).
export type { TKey } from '@paisa/shared';
import type { TKey } from '@paisa/shared';

/** Both meters are whole numbers, clamped to 0–25 (VITALS_MAX). */
export interface Vitals {
  health: number;
  sanity: number;
}

/**
 * The slice of GameState the life actions read and write. GameState already has month, week
 * and flags; `earned` is in CLAUDE.md 5.1; `money` (one common wallet, whole rupees) and
 * `vitals` are the proposed additive fields. Functions are generic over it, so a full
 * GameState passes straight through.
 */
export interface LifeState {
  month: number;
  week: number;
  day: number;     // 1–7 within the week; resting at home moves to the next
  money: number;
  debt: number;    // whole rupees owed (e.g. a family loan for a hospital bill); never negative
  flags: string[];
  earned: string[];
  vitals: Vitals;
}

/** Pixel icons drawn by PixelIcon. */
export type IconId = 'coin' | 'heart' | 'smile' | 'sack' | 'headphones' | 'phone' | 'warn' | 'person' | 'school' | 'cross' | 'bandage' | 'moon' | 'house';

/** The convenience store's two options. */
export type ShopKind = 'necessity' | 'want';

export interface ShopOffer {
  kind: ShopKind;
  label: TKey;
  hint: TKey;
  icon: IconId;
  price: number;   // whole rupees, from the common wallet
  health: number;  // meter change, before clamping
  sanity: number;
  affordable: boolean;
}

/** What one action changed, after clamping. `money` is negative for a spend. */
export interface LifeDelta {
  money: number;
  health: number;
  sanity: number;
  debt?: number;   // + borrowed, − repaid; absent when unchanged
}

/** A choice's effects (events, phone threads). Money: + earns, − spends. Debt: + borrows. */
export interface LifeEffects {
  money?: number;
  health?: number;
  sanity?: number;
  debt?: number;
}

/**
 * What to do when a spend is more than the wallet holds: 'block' (the choice can't be taken,
 * e.g. paying a bill) or 'all' (a scammer takes whatever is there).
 */
export type ShortMode = 'block' | 'all';

export type LifeBlock = 'not_enough_money' | 'already_worked' | 'school_first' | 'already_at_school' | 'no_debt';

/** A blocked action returns the input state unchanged (same object) and a zero delta. */
export interface LifeOutcome<S extends LifeState> {
  state: S;
  delta: LifeDelta;
  blocked?: LifeBlock;
}

/** Proposed additive SyncEvent types (docs/life-meters-api.md §5). */
export type LifeEventType = 'shop_purchase' | 'work_shift' | 'school_attended' | 'day_rested';

export interface LifeSyncEvent {
  event_id: string;
  anon_id: string;
  class_id: string;
  type: LifeEventType;
  payload: Record<string, string | number>;
  client_ts: string;
  content_version: string;
}
