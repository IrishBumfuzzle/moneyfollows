// class_status (CLAUDE.md 5.5 / API.md): what the teacher can change after a student joined.
// Today that is the end-line quiz gate and the rejoin code. Read on app start, on reconnect, when
// the app comes back to the foreground and when the Classroom opens. The last known gate is kept
// on the profile, so an offline start keeps it (with no answer at all the gate stays closed).
import { create } from 'zustand';
import { ApiError } from '@paisa/api-client';
import { saveProfile } from '../features/onboarding/profile';
import type { Profile } from '../features/onboarding/types';
import { backendConfigured, isOnline, loadApi } from './backend';

interface ClassStatusState {
  /** null until the server has answered once on this page load. */
  endlineOpen: boolean | null;
}

export const useClassStatus = create<ClassStatusState>(() => ({ endlineOpen: null }));

/**
 * Starts the gate from the profile's last known answer, if the server has not answered yet on this
 * page load (an offline cold start). A server answer is never overwritten by an older saved one.
 */
export function seedClassStatus(saved: boolean | undefined): void {
  if (saved !== undefined && useClassStatus.getState().endlineOpen === null) useClassStatus.setState({ endlineOpen: saved });
}

// Students with a request running: a second trigger (foreground and Classroom within a moment of
// each other) would only ask the same question again.
const inFlight = new Set<string>();

/**
 * ok: the server answered and the store is up to date.
 * stale: the server does not know this phone's ids (a stand-in or old profile, or another
 *   backend): the caller should forget them and show onboarding.
 * skipped: nothing to do or no answer (no backend, offline, server error); leave things as they are.
 */
export type ClassStatusResult = 'ok' | 'stale' | 'skipped';

/**
 * Asks the server for this student's class settings. A changed rejoin code (the teacher reset
 * it) or end-line gate is saved to the profile and handed to `onProfile`, so the screens show the
 * current code and an offline start keeps the gate. A call while one is already running for this
 * student returns 'skipped': the running one updates the store. Never throws.
 */
export async function refreshClassStatus(
  profile: Profile,
  onProfile?: (updated: Profile) => void,
): Promise<ClassStatusResult> {
  if (!backendConfigured || !isOnline()) return 'skipped';
  const key = `${profile.anonId}:${profile.classId}`;
  if (inFlight.has(key)) return 'skipped';
  inFlight.add(key);
  try {
    const api = await loadApi();
    if (!api) return 'skipped';
    const status = await api.classStatus(profile.anonId, profile.classId);
    const open = status.endline_open === true;
    useClassStatus.setState({ endlineOpen: open });
    const codeChanged = !!status.rejoin_code && status.rejoin_code !== profile.rejoinCode;
    const gateChanged = open !== (profile.endlineOpen === true);
    if (codeChanged || gateChanged) {
      const updated: Profile = { ...profile };
      if (codeChanged) updated.rejoinCode = status.rejoin_code;
      if (gateChanged) updated.endlineOpen = open;
      try {
        await saveProfile(updated);
      } catch (err) {
        console.warn('[class status] could not save the class settings', err); // still shown this session
      }
      onProfile?.(updated);
    }
    return 'ok';
  } catch (err) {
    if (err instanceof ApiError && err.code === 'class_not_found') return 'stale';
    return 'skipped'; // network, timeout, chunk failed to load: try again on the next start or reconnect
  } finally {
    inFlight.delete(key);
  }
}
