// "Reset everything" (demo panel): clears this save's IndexedDB store and reloads. In demo mode
// that is only the demo database, which the reload seeds again; a real student's save is never
// touched. Outside demo mode (dev builds only) it clears the default store: onboarding again.
import { clear } from 'idb-keyval';
import { saveStore } from './slot';

export async function resetSaves(): Promise<void> {
  try {
    await clear(saveStore);
  } catch (err) {
    console.warn('[demo] could not clear the saves', err);
  }
  window.location.reload();
}
