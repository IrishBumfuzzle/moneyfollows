// Life actions API: the convenience store's two options, working, going to school and resting.
// The screens call only `lifeApi`. Today it is a local stand-in with the engine's rules
// (CLAUDE.md 4: pure, no DOM, no clock, no randomness, never mutates its input). When BE-1
// ships buy/work/attendSchool in packages/engine (docs/life-meters-api.md §4), point
// `lifeApi` at those and delete the stand-in below; the screens don't change.
import {
  DAYS_PER_WEEK,
  LIFE_CONTENT_VERSION,
  REST,
  SCHOOL,
  SHOP,
  START_MONEY,
  START_VITALS,
  VITALS_MAX,
  VITALS_MIN,
  WEEKS_PER_MONTH,
  WORK,
} from './config';
import type {
  LifeBlock,
  LifeDelta,
  LifeEffects,
  LifeEventType,
  LifeOutcome,
  LifeState,
  LifeSyncEvent,
  ShopKind,
  ShopOffer,
  ShortMode,
  Vitals,
} from './types';

export interface LifeApi {
  shopOffers<S extends LifeState>(state: S): ShopOffer[];
  buy<S extends LifeState>(state: S, kind: ShopKind): LifeOutcome<S>;
  /**
   * One shift a day, and only after school that day. `wage` is what the shift earned (the
   * Counter Shift pays per customer), 0 to WORK.wage.
   */
  work<S extends LifeState>(state: S, wage?: number): LifeOutcome<S>;
  /** Once a day. */
  attendSchool<S extends LifeState>(state: S): LifeOutcome<S>;
  /** Sleep at home: brings back some health and sanity and moves to the next day (week, month). */
  rest<S extends LifeState>(state: S): LifeOutcome<S>;
  /** Applies an event or phone choice's effects. A spend beyond the wallet follows `ifShort`. */
  applyEffects<S extends LifeState>(state: S, effects: LifeEffects, ifShort?: ShortMode): LifeOutcome<S>;
  /** Pays back as much debt as the wallet allows. */
  repay<S extends LifeState>(state: S): LifeOutcome<S>;
}

const clamp = (n: number) => Math.min(VITALS_MAX, Math.max(VITALS_MIN, Math.round(n)));

/** Vitals for a new game, or for a save made before vitals existed. */
export function startVitals(): Vitals {
  return { ...START_VITALS };
}

/** A fresh life state for screens to play with until the shared game store exists. */
export function startLife(): LifeState {
  return { month: 1, week: 1, day: 1, money: START_MONEY, debt: 0, flags: [], earned: [], vitals: startVitals() };
}

/** Once-per-day keys. Work uses the engine's earn() sourceId convention. */
const today = (s: LifeState) => `${s.month}:${s.week}:${s.day}`;
export const workSourceId = (s: LifeState) => `work:${today(s)}`;
export const schoolFlag = (s: LifeState) => `school:${today(s)}`;
export const workedToday = (s: LifeState) => s.earned.includes(workSourceId(s));
export const schoolToday = (s: LifeState) => s.flags.includes(schoolFlag(s));

/** The day after `s`: day 7 rolls the week, week 4 rolls the month. */
export function nextDay(s: Pick<LifeState, 'month' | 'week' | 'day'>) {
  if (s.day < DAYS_PER_WEEK) return { month: s.month, week: s.week, day: s.day + 1 };
  if (s.week < WEEKS_PER_MONTH) return { month: s.month, week: s.week + 1, day: 1 };
  return { month: s.month + 1, week: 1, day: 1 };
}

function blocked<S extends LifeState>(state: S, reason: LifeBlock): LifeOutcome<S> {
  return { state, delta: { money: 0, health: 0, sanity: 0 }, blocked: reason };
}

/** Applies meter changes and reports what actually moved after clamping. */
function applyVitals(v: Vitals, health: number, sanity: number) {
  const next = { health: clamp(v.health + health), sanity: clamp(v.sanity + sanity) };
  return { vitals: next, health: next.health - v.health, sanity: next.sanity - v.sanity };
}

export const localLifeApi: LifeApi = {
  shopOffers(state) {
    return (Object.keys(SHOP) as ShopKind[]).map((kind) => {
      const o = SHOP[kind];
      return { kind, ...o, affordable: state.money >= o.price };
    });
  },

  // Money never goes negative (CLAUDE.md 5.2 rule 3): a purchase the wallet can't cover is blocked.
  buy(state, kind) {
    const o = SHOP[kind];
    if (state.money < o.price) return blocked(state, 'not_enough_money');
    const v = applyVitals(state.vitals, o.health, o.sanity);
    const delta: LifeDelta = { money: -o.price, health: v.health, sanity: v.sanity };
    return { state: { ...state, money: state.money - o.price, vitals: v.vitals }, delta };
  },

  work(state, wage = WORK.wage) {
    const id = workSourceId(state);
    if (state.earned.includes(id)) return blocked(state, 'already_worked');
    if (!schoolToday(state)) return blocked(state, 'school_first');
    const pay = Math.max(0, Math.min(WORK.wage, Math.floor(wage)));
    const v = applyVitals(state.vitals, WORK.health, WORK.sanity);
    const delta: LifeDelta = { money: pay, health: v.health, sanity: v.sanity };
    return {
      state: {
        ...state,
        money: state.money + pay,
        earned: [...state.earned, id],
        vitals: v.vitals,
      },
      delta,
    };
  },

  attendSchool(state) {
    const flag = schoolFlag(state);
    if (state.flags.includes(flag)) return blocked(state, 'already_at_school');
    const v = applyVitals(state.vitals, SCHOOL.health, SCHOOL.sanity);
    return {
      state: { ...state, flags: [...state.flags, flag], vitals: v.vitals },
      delta: { money: 0, health: v.health, sanity: v.sanity },
    };
  },

  rest(state) {
    const v = applyVitals(state.vitals, REST.health, REST.sanity);
    return {
      state: { ...state, ...nextDay(state), vitals: v.vitals },
      delta: { money: 0, health: v.health, sanity: v.sanity },
    };
  },

  applyEffects(state, effects, ifShort = 'block') {
    const spend = Math.min(0, effects.money ?? 0);
    if (-spend > state.money && ifShort === 'block') return blocked(state, 'not_enough_money');
    // 'all': a spend can take the wallet to zero, never below (CLAUDE.md 5.2 rule 3).
    const money = Math.max(0, state.money + (effects.money ?? 0)) - state.money;
    const debt = Math.max(0, state.debt + (effects.debt ?? 0)) - state.debt;
    const v = applyVitals(state.vitals, effects.health ?? 0, effects.sanity ?? 0);
    const delta: LifeDelta = { money, health: v.health, sanity: v.sanity, ...(debt ? { debt } : {}) };
    return { state: { ...state, money: state.money + money, debt: state.debt + debt, vitals: v.vitals }, delta };
  },

  repay(state) {
    if (state.debt <= 0) return blocked(state, 'no_debt');
    const pay = Math.min(state.debt, state.money);
    if (pay <= 0) return blocked(state, 'not_enough_money');
    return {
      state: { ...state, money: state.money - pay, debt: state.debt - pay },
      delta: { money: -pay, health: 0, sanity: 0, debt: -pay },
    };
  },
};

/** The API the screens use. Swap this one line for the engine-backed version later. */
export const lifeApi: LifeApi = localLifeApi;

export interface LifeEventCtx {
  event_id: string;
  anon_id: string;
  class_id: string;
  client_ts: string;
}

/**
 * Builds the SyncEvent for a successful action (docs/life-meters-api.md §5). Returns null for
 * a blocked action, which sends nothing. `state` is the state the action was played in.
 */
export type LifeAction = { kind: 'buy'; shop: ShopKind } | { kind: 'work' } | { kind: 'school' } | { kind: 'rest' };

/** The type and payload to track for a successful action (src/api/track adds the ids); null if blocked. */
export function lifeEvent(
  action: LifeAction,
  state: LifeState,
  outcome: LifeOutcome<LifeState>,
): Pick<LifeSyncEvent, 'type' | 'payload'> | null {
  if (outcome.blocked) return null;
  const { delta } = outcome;
  // The day it happened (for rest: the day that ended), so the backend counts once per day.
  const base = { month: state.month, week: state.week, day: state.day, health: delta.health, sanity: delta.sanity };
  let type: LifeEventType;
  let payload: Record<string, string | number>;
  if (action.kind === 'buy') {
    type = 'shop_purchase';
    payload = { ...base, kind: action.shop, price: -delta.money };
  } else if (action.kind === 'work') {
    type = 'work_shift';
    payload = { ...base, wage: delta.money };
  } else if (action.kind === 'school') {
    type = 'school_attended';
    payload = base;
  } else {
    type = 'day_rested';
    payload = base;
  }
  return { type, payload };
}

export function toLifeEvent(action: LifeAction, state: LifeState, outcome: LifeOutcome<LifeState>, ctx: LifeEventCtx): LifeSyncEvent | null {
  const e = lifeEvent(action, state, outcome);
  return e && { ...ctx, ...e, content_version: LIFE_CONTENT_VERSION };
}
