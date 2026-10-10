import { useEffect, useState } from 'react';
import { ClassroomScreen } from './features/classroom/ClassroomScreen';
import type { Lang } from './features/classroom/types';
import { Onboarding, loadProfile } from './features/onboarding';
import type { Profile } from './features/onboarding';
import { LocationScreen } from './screens/LocationScreen';

type Screen = 'map' | 'classroom';

// No router or language picker yet: ?lang=hi switches language, ?screen=classroom opens
// the classroom directly, ?seed=N fixes the quiz (demo / tests).
const params = new URLSearchParams(window.location.search);
const LANG: Lang = params.get('lang') === 'hi' ? 'hi' : 'en';
const SEED = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);

export function App() {
  const [screen, setScreen] = useState<Screen>(params.get('screen') === 'classroom' ? 'classroom' : 'map');

  // Each place is a history entry, so Android's back button goes up to the map
  // instead of leaving the app (CLAUDE.md 6).
  useEffect(() => {
    const on = (e: PopStateEvent) => setScreen((e.state as { screen?: Screen } | null)?.screen ?? 'map');
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const open = (s: Screen) => {
    window.history.pushState({ screen: s }, '');
    setScreen(s);
  };
  const back = () => {
    if ((window.history.state as { screen?: Screen } | null)?.screen) window.history.back();
    else setScreen('map');
  };

  // First launch shows onboarding; afterwards the saved profile skips it. undefined = still reading IndexedDB.
  const [profile, setProfile] = useState<Profile | null>();
  useEffect(() => void loadProfile().then((p) => setProfile(p ?? null)), []);
  if (profile === undefined) return null;
  if (profile === null) return <Onboarding initialLang={LANG} onDone={setProfile} />;
  const lang = params.has('lang') ? LANG : profile.lang; // ?lang= still overrides for demos and tests

  if (screen === 'classroom') {
    return (
      <ClassroomScreen
        lang={lang}
        seed={SEED}
        onExit={back}
        // TODO: queue toSubmittedEvent(result, …) once api-client's sync queue is on main (API.md).
        onFinish={(r) => console.info('quiz finished', r)}
      />
    );
  }
  return <LocationScreen onSelect={(id) => (id === 'school' ? open('classroom') : console.log('go to', id))} />;
}
