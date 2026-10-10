// Shared game store (CLAUDE.md 3: shared by UI-1 and UI-2). Holds the life state (common money
// wallet, health, sanity, week) until packages/engine is on main; then it holds the engine's
// GameState and these actions call the engine. Saved to IndexedDB so a reload keeps progress.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { VITALS_MAX } from '../features/life/config';
import { startLife } from '../features/life/life';
import type { LifeDelta, LifeOutcome, LifeState } from '../features/life/types';
import { idbStorage } from './storage';

/** The last change, for the meters bar's "+12" pops; `id` restarts the pop on a repeat. */
export interface LastChange {
  id: number;
  delta: LifeDelta;
}

export interface GameStore {
  life: LifeState;
  last: LastChange | null;
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

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      life: startLife(),
      last: null,
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
      version: 3,
      // v1 saves had no debt. v2 saves had no day and meters out of 100 (now 25).
      migrate: (saved, version) => {
        const s = saved as { life: LifeState };
        if (version < 2) s.life = { ...s.life, debt: s.life.debt ?? 0 };
        if (version < 3) {
          const quarter = (n: number) => Math.min(VITALS_MAX, Math.max(0, Math.round(n / 4)));
          const v = s.life.vitals;
          s.life = { ...s.life, day: 1, vitals: { health: quarter(v.health), sanity: quarter(v.sanity) } };
        }
        return s as GameStore;
      },
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ life: s.life }),
    },
  ),
);
