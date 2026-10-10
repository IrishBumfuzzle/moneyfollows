// Life meters: money, health and sanity (docs/life-meters-api.md).
// TKey mirrors packages/shared (origin/Backend, CLAUDE.md 5.1); when it lands on main,
// import it from '@paisa/shared' and keep only the life-specific types here.

export type TKey = `t:${string}`;

/** Both meters are whole numbers, clamped to 0–100. */
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
  money: number;
  flags: string[];
  earned: string[];
  vitals: Vitals;
}

/** Pixel icons drawn by PixelIcon. */
export type IconId = 'coin' | 'heart' | 'smile' | 'sack' | 'headphones';

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
}

export type LifeBlock = 'not_enough_money' | 'already_worked' | 'already_at_school';

/** A blocked action returns the input state unchanged (same object) and a zero delta. */
export interface LifeOutcome<S extends LifeState> {
  state: S;
  delta: LifeDelta;
  blocked?: LifeBlock;
}

/** Proposed additive SyncEvent types (docs/life-meters-api.md §5). */
export type LifeEventType = 'shop_purchase' | 'work_shift' | 'school_attended';

export interface LifeSyncEvent {
  event_id: string;
  anon_id: string;
  class_id: string;
  type: LifeEventType;
  payload: Record<string, string | number>;
  client_ts: string;
  content_version: string;
}
