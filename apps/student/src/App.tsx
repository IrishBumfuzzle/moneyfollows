import { useCallback, useEffect, useState } from 'react';
import { ClassroomScreen } from './features/classroom/ClassroomScreen';
import { PhoneLayer, PhoneScreen, SuddenEventSheet, triggerEvent, useEvents } from './features/events';
import type { Lang } from './features/classroom/types';
import { MetersBar } from './features/life/MetersBar';
import { StoreSheet } from './features/life/StoreSheet';
import { t as mainT } from './features/main/content';
import { MainScreen } from './features/main/MainScreen';
import { PaisaTimes } from './features/news';
import { Onboarding, loadProfile } from './features/onboarding';
import type { Profile } from './features/onboarding';
import { useStoresHydrated } from './game/hydration';
import { useGame } from './game/useGame';
import { LocationScreen } from './screens/LocationScreen';
import './design/kenney.css';

type Screen = 'main' | 'map' | 'classroom' | 'store' | 'news' | 'phone';
const SCREENS: Screen[] = ['main', 'map', 'classroom', 'store', 'news', 'phone'];

// No router or language picker yet: ?lang=hi switches language, ?screen=map|classroom|store|news|phone
// opens that screen directly, ?seed=N fixes the quiz, ?event=<id> fires an event (demo / tests).
const params = new URLSearchParams(window.location.search);
const LANG: Lang = params.get('lang') === 'hi' ? 'hi' : 'en';
const SEED = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);

const screenOf = (state: unknown): Screen => (state as { screen?: Screen } | null)?.screen ?? 'main';

export function App() {
  // A reload keeps the history entry, so start where it says (else ?screen=, else main).
  const [screen, setScreen] = useState<Screen>(() => {
    const s = (window.history.state as { screen?: Screen } | null)?.screen ?? (params.get('screen') as Screen | null);
    return s && SCREENS.includes(s) ? s : 'main';
  });
  const life = useGame((s) => s.life);
  const last = useGame((s) => s.last);
  const apply = useGame((s) => s.apply);
  const tick = useEvents((s) => s.tick);
  const hydrated = useStoresHydrated();

  // ?event=event.injury.01 (or a phone.* id) fires that event once the saved state has loaded.
  useEffect(() => {
    const id = params.get('event');
    if (hydrated && id) triggerEvent(id);
  }, [hydrated]);

  // Each screen is a history entry, so Android's back button goes up a level (place → map →
  // main screen) instead of leaving the app (CLAUDE.md 6). Paisa Times adds its own levels.
  useEffect(() => {
    const on = (e: PopStateEvent) => setScreen(screenOf(e.state));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const open = (s: Screen) => {
    window.history.pushState({ screen: s }, '');
    setScreen(s);
  };
  const back = useCallback(() => {
    if ((window.history.state as { screen?: Screen } | null)?.screen) window.history.back();
    else setScreen((s) => (s === 'store' || s === 'classroom' ? 'map' : 'main'));
  }, []);

  // First launch shows onboarding; afterwards the saved profile skips it. undefined = still reading IndexedDB.
  const [profile, setProfile] = useState<Profile | null>();
  useEffect(() => void loadProfile().then((p) => setProfile(p ?? null)), []);
  if (profile === undefined || !hydrated) return null;
  if (profile === null) return <Onboarding initialLang={LANG} onDone={setProfile} />;
  const lang = params.has('lang') ? LANG : profile.lang; // ?lang= still overrides for demos and tests
  const name = mainT(lang, `persona.${profile.persona}.name`);
  const openPhone = (thread?: string) => {
    window.history.pushState({ screen: 'phone' }, '');
    if (thread) window.history.pushState({ screen: 'phone', thread }, '');
    setScreen('phone');
  };
  // Events and messages only surface on the map and main screen, never over a scene (CLAUDE.md 5.8).
  const eventLayer = (where: 'map' | 'main') => (
    <>
      <PhoneLayer lang={lang} name={name} where={where} onOpen={openPhone} />
      <SuddenEventSheet lang={lang} name={name} />
    </>
  );

  if (screen === 'main') {
    return (
      <>
        <MainScreen
          profile={profile}
          lang={lang}
          onPlay={() => {
            open('map');
            tick();
          }}
          onOpenNews={() => open('news')}
        />
        {eventLayer('main')}
      </>
    );
  }
  if (screen === 'news') return <PaisaTimes lang={lang} onExit={back} />;
  if (screen === 'phone') return <PhoneScreen lang={lang} name={name} onExit={back} />;
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
  return (
    <>
      <LocationScreen
        onSelect={(id) => {
          tick();
          if (id === 'school') open('classroom');
          else if (id === 'convenience') open('store');
          else console.log('go to', id);
        }}
      />
      <MetersBar lang={lang} state={life} pop={last} />
      {screen === 'map' && eventLayer('map')}
      {/* TODO: queue toLifeEvent(...) once the backend accepts the life events (docs/life-meters-api.md §5). */}
      {screen === 'store' && (
        <StoreSheet
          lang={lang}
          state={life}
          onBuy={(_, out) => {
            apply(out);
            tick();
          }}
          onClose={back}
        />
      )}
    </>
  );
}
