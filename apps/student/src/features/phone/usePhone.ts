// Phone state that outlives a visit: the Snake best score and when Snake last calmed the
// character down. Saved to IndexedDB.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from '../../game/storage';

interface PhoneStore {
  snakeBest: number;
  /** "month:week" when Snake last gave its sanity boost (once per in-game week). */
  relaxedWeek: string | null;
  recordSnake: (score: number) => boolean;
  markRelaxed: (week: string) => void;
}

export const usePhone = create<PhoneStore>()(
  persist(
    (set, get) => ({
      snakeBest: 0,
      relaxedWeek: null,
      /** Returns true when `score` is a new best. */
      recordSnake: (score) => {
        if (score <= get().snakeBest) return false;
        set({ snakeBest: score });
        return true;
      },
      markRelaxed: (week) => set({ relaxedWeek: week }),
    }),
    { name: 'paisa.phone', version: 1, storage: createJSONStorage(() => idbStorage) },
  ),
);
