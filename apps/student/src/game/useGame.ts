// Shared game store (CLAUDE.md 3: shared by UI-1 and UI-2). Holds two money models side by
// side: `life` (one common wallet, health, sanity, the day) and `plan`, the engine's GameState:
// the persona's monthly money plan in four jars, where decisions, rewind, payday and the Month
// Recap happen. Plan actions call the engine (features/decisions/plan.ts); components never
// mutate either. Saved to IndexedDB so a reload keeps progress.
import type { GameState, PersonaId } from '@paisa/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { planChoose, planRewind, planSleep, randomSeed, startPlan } from '../features/decisions/plan';
import type { Consequence, Landed, SleepOutcome } from '../features/decisions/plan';
import { VITALS_MAX } from '../features/life/config';
import { startLife } from '../features/life/life';
import type { LifeDelta, LifeOutcome, LifeState } from '../features/life/types';
import { idbStorage } from './storage';

/** The last change, for the meters bar's "+12" pops; `id` restarts the pop on a repeat. */
export interface LastChange {
  id: number;
  delta: LifeDelta;
}

/** What changed overnight in the plan: delayed effects that landed, and payday at a new month. Not saved. */
export interface Overnight {
  id: number;
  landed: Landed;
  payday?: Consequence['payday'];
}

export interface GameStore {
  life: LifeState;
  last: LastChange | null;
  /** The persona's monthly money plan (engine GameState). Null until the map first opens. */
  plan: GameState | null;
  overnight: Overnight | null;
  /** Creates the plan if there is none yet (first map open). `seed` from ?seed=, else random. */
  ensurePlan: (persona: PersonaId, seed?: number) => void;
  /** Plays a choice on a pinned card. Null (nothing changes) if the card isn't pinned. */
  choosePlan: (scenarioId: string, choiceId: string) => Consequence | null;
  /** Undoes the last choice, using a token. False when there was nothing to undo. */
  rewindPlan: () => boolean;
  /**
   * Ends the plan's week (day 7 at Home), before the life rest. 'blocked' changes nothing.
   * After week 4 the plan waits at month end for the Month Recap; see continueMonth.
   */
  sleepPlan: () => SleepOutcome | null;
  /** After the Month Recap: the next month starts with payday (shown from `overnight`). */
  continueMonth: () => void;
  clearOvernight: () => void;
  /** Stores a lifeApi outcome (store purchase, work, school). Blocked outcomes change nothing. */
  apply: (outcome: LifeOutcome<LifeState>) => void;
  /**
   * Pays earned income (e.g. the paper-route wage) into the wallet. Idempotent per sourceId,
   * like the engine's earn() (CLAUDE.md 5.2 rule 7). Returns true if it paid.
   */
  earn: (amount: number, sourceId: string) => boolean;
  /** Demo panel: forget sourceIds starting with `prefix` so they can pay again. Never in normal play. */
  forgetEarned: (prefix: string) => void;
}

/** Pure earn(), exported for tests: same rules as the engine's. Null when nothing is paid. */
export function earnLife(life: LifeState, amount: number, sourceId: string): LifeState | null {
  if (amount <= 0 || !Number.isInteger(amount) || life.earned.includes(sourceId)) return null;
  return { ...life, money: life.money + amount, earned: [...life.earned, sourceId] };
}

/** Overnight news worth a sheet, or null when nothing landed and there was no payday. */
function overnightOf(prev: Overnight | null, landed: Landed, payday: Consequence['payday']): Overnight | null {
  if (landed.length === 0 && !payday) return null;
  return { id: (prev?.id ?? 0) + 1, landed, ...(payday ? { payday } : {}) };
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      life: startLife(),
      last: null,
      plan: null,
      overnight: null,
      ensurePlan: (persona, seed) => {
        if (get().plan) return;
        set({ plan: startPlan(persona, seed ?? randomSeed()) });
      },
      choosePlan: (scenarioId, choiceId) => {
        const plan = get().plan;
        if (!plan) return null;
        try {
          const r = planChoose(plan, scenarioId, choiceId);
          set({ plan: r.state });
          return r.consequence;
        } catch {
          return null; // not pinned (e.g. a double tap after it was played)
        }
      },
      rewindPlan: () => {
        const plan = get().plan;
        const back = plan && planRewind(plan);
        if (!back) return false;
        set({ plan: back });
        return true;
      },
      sleepPlan: () => {
        const plan = get().plan;
        if (!plan) return null;
        const out = planSleep(plan);
        if (out.kind === 'slept') {
          const { state, landed, payday } = out.result;
          set((s) => ({ plan: state, overnight: overnightOf(s.overnight, landed, payday) }));
        }
        return out;
      },
      continueMonth: () => {
        const plan = get().plan;
        if (plan?.stage !== 'monthEnd') return;
        get().sleepPlan();
      },
      clearOvernight: () => set({ overnight: null }),
      apply: (out) => {
        if (out.blocked) return;
        set((s) => ({ life: out.state, last: { id: (s.last?.id ?? 0) + 1, delta: out.delta } }));
      },
      earn: (amount, sourceId) => {
        const next = earnLife(get().life, amount, sourceId);
        if (!next) return false;
        set((s) => ({ life: next, last: { id: (s.last?.id ?? 0) + 1, delta: { money: amount, health: 0, sanity: 0 } } }));
        return true;
      },
      forgetEarned: (prefix) =>
        set((s) => ({ life: { ...s.life, earned: s.life.earned.filter((id) => !id.startsWith(prefix)) } })),
    }),
    {
      name: 'paisa.game',
      version: 4,
      // v1 saves had no debt. v2 saves had no day and meters out of 100 (now 25). v3 had no plan.
      migrate: (saved, version) => {
        const s = saved as { life: LifeState; plan?: GameState | null };
        if (version < 2) s.life = { ...s.life, debt: s.life.debt ?? 0 };
        if (version < 3) {
          const quarter = (n: number) => Math.min(VITALS_MAX, Math.max(0, Math.round(n / 4)));
          const v = s.life.vitals;
          s.life = { ...s.life, day: 1, vitals: { health: quarter(v.health), sanity: quarter(v.sanity) } };
        }
        if (version < 4) s.plan = null;
        return s as GameStore;
      },
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ life: s.life, plan: s.plan }),
    },
  ),
);
