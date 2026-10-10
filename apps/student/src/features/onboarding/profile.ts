import { get, set } from 'idb-keyval';
import type { Profile } from './types';

const KEY = 'paisa.profile';

/** The saved profile, or undefined on first launch (or if IndexedDB is unavailable, e.g. private mode). */
export async function loadProfile(): Promise<Profile | undefined> {
  try {
    const p = await get<Profile>(KEY);
    return p?.version === 1 ? p : undefined;
  } catch {
    return undefined;
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  await set(KEY, p);
}
