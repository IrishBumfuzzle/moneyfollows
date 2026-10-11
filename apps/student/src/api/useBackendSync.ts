// Connects the running app to the backend (CLAUDE.md 6): starts background sync, tells the
// sync layer who is playing, and keeps the class settings fresh. App.tsx calls it once.
import { useCallback, useEffect, useRef } from 'react';
import { useAssessments } from '../features/classroom/assessments';
import { clearProfile } from '../features/onboarding/profile';
import type { Profile } from '../features/onboarding/types';
import { DEMO } from '../features/demo/slot';
import { forget, identify, startSync } from './backend';
import { refreshClassStatus, seedClassStatus, useClassStatus } from './classStatus';

/**
 * `profile`: undefined while it is still being read from the phone, null before onboarding is done.
 * `setProfile` receives an updated profile (new rejoin code), or null when the server doesn't
 * know this phone's ids any more, which sends the student back through onboarding.
 * Returns a stable function that re-reads the class settings now (the Classroom calls it when it
 * opens); it does nothing before a profile exists.
 */
export function useBackendSync(profile: Profile | null | undefined, setProfile: (p: Profile | null) => void): () => void {
  useEffect(() => {
    return startSync(); // the stop function is the cleanup
  }, []);

  // Offline cold start: the last known end-line gate comes from the profile until the server answers.
  const savedGate = profile?.endlineOpen;
  useEffect(() => {
    seedClassStatus(savedGate);
  }, [savedGate]);

  // The class-status check below reads the newest profile, not the one its effect started with.
  const latest = useRef(profile);
  latest.current = profile;
  const check = useRef<(() => Promise<void>) | null>(null);
  const anonId = profile?.anonId;
  const classId = profile?.classId;

  useEffect(() => {
    if (!anonId || !classId) return;
    // Also drains events tracked during onboarding, before there was an anon_id.
    void identify({ anon_id: anonId, class_id: classId });

    let live = true;
    const run = async () => {
      const p = latest.current;
      if (!p) return;
      const result = await refreshClassStatus(p, (updated) => {
        if (live) setProfile(updated);
      });
      // A demo played on the offline stand-in is unknown to the server: keep playing it.
      if (result === 'stale' && live && !DEMO) {
        // Game progress stays on the phone; only who this phone is gets forgotten. The start and
        // end checks belong to the old identity, so the new one is offered them again.
        await forget();
        await clearProfile();
        useAssessments.getState().reset();
        useClassStatus.setState({ endlineOpen: null });
        setProfile(null);
      }
    };
    // A backgrounded app that is resumed gets no reload or connectivity change, so the teacher
    // opening the end-line meanwhile would go unseen: look again whenever it is shown.
    const visible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    check.current = run;
    void run();
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', visible);
    return () => {
      live = false;
      check.current = null;
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [anonId, classId, setProfile]);

  return useCallback(() => void check.current?.(), []);
}
