import { del, get, set } from 'idb-keyval';
import { saveReady, saveStore } from '../demo/slot';
import type { Profile } from './types';

const KEY = 'paisa.profile';

/** The saved profile, or undefined on first launch (or if IndexedDB is unavailable, e.g. private mode). */
export async function loadProfile(): Promise<Profile | undefined> {
  try {
    await saveReady(); // demo mode: the seeded profile (features/demo/slot.ts)
    const p = await get<Profile>(KEY, saveStore);
    return p?.version === 1 ? p : undefined;
  } catch {
    return undefined;
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  await set(KEY, p, saveStore);
}

/** Forgets who this phone is (the server no longer knows the saved ids), so onboarding shows again. Game progress is kept. */
export async function clearProfile(): Promise<void> {
  try {
    await del(KEY, saveStore);
  } catch {
    // IndexedDB unavailable (private mode): nothing was saved, so nothing to clear
  }
}
