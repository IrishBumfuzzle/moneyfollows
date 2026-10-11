// IndexedDB storage for zustand's persist middleware (idb-keyval). Works offline and survives
// reloads. Errors (private mode, blocked storage) are swallowed, so the game still runs, unsaved.
// Demo mode (?demo=1) reads and writes its own database instead (features/demo/slot.ts).
import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';
import { saveReady, saveStore } from '../features/demo/slot';

export const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      await saveReady();
      return (await get<string>(name, saveStore)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await set(name, value, saveStore);
    } catch {
      /* unsaved this session */
    }
  },
  removeItem: async (name) => {
    try {
      await del(name, saveStore);
    } catch {
      /* nothing to remove */
    }
  },
};
