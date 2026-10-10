// IndexedDB storage for zustand's persist middleware (idb-keyval). Works offline and survives
// reloads. Errors (private mode, blocked storage) are swallowed, so the game still runs, unsaved.
import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

export const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await get<string>(name)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await set(name, value);
    } catch {
      /* unsaved this session */
    }
  },
  removeItem: async (name) => {
    try {
      await del(name);
    } catch {
      /* nothing to remove */
    }
  },
};
