import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@paisa/shared';
import { flush, setStudent, track } from './api/track';
import { ErrorBoundary } from './ErrorBoundary';
import { CLASSROOM_BANK } from './features/classroom/content';
import { ClassroomScreen } from './features/classroom/ClassroomScreen';
import { loadClassroomConfig } from './features/classroom/config';
import type { ClassroomConfig } from './features/classroom/config';
import { PhoneLayer, PhoneScreen, SuddenEventSheet, triggerEvent, useEvents } from './features/events';
import { MetersBar } from './features/life/MetersBar';
import { StoreSheet } from './features/life/StoreSheet';
import { trackLife } from './features/life/track';
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
  const [profile, setProfile] = useState<Profile | null>();
  const lang: Lang = params.has('lang') || !profile ? LANG : profile.lang; // ?lang= overrides for demos and tests
  return (
    <ErrorBoundary lang={lang}>
      <Game profile={profile} setProfile={setProfile} lang={lang} />
    </ErrorBoundary>
  );
}

function Game({ profile, setProfile, lang }: {
  profile: Profile | null | undefined;
  setProfile: (p: Profile | null) => void;
  lang: Lang;
}) {
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

  // map_opened each time the map is shown (CLAUDE.md 5.5); closing the store sheet over it doesn't count.
  const prevScreen = useRef<Screen | null>(null);
  useEffect(() => {
    if (screen === 'map' && profile && prevScreen.current !== 'store') track('map_opened');
    prevScreen.current = screen;
  }, [screen, profile]);

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
  const parentOf = (s: Screen): Screen => (s === 'store' || s === 'classroom' ? 'map' : 'main');
  const back = useCallback(() => {
    const from = screenOf(window.history.state);
    if (!(window.history.state as { screen?: Screen } | null)?.screen) return setScreen((s) => parentOf(s));
    window.history.back();
    // If the browser drops the step (no earlier entry in this tab), go up a level anyway rather
    // than leaving the player on a screen whose exit did nothing.
    window.setTimeout(() => {
      if (screenOf(window.history.state) === from) setScreen(parentOf(from));
    }, 400);
  }, []);

  // First launch shows onboarding; afterwards the saved profile skips it. undefined = still reading IndexedDB.
  useEffect(() => {
    void loadProfile().then((p) => {
      setProfile(p ?? null);
      // Every start: tell the tracker who the student is (also sends anything held or queued).
      if (p) setStudent(p.anonId, p.classId);
    });
  }, [setProfile]);

  // The facilitator's classroom setup (question count, pillars); refreshed each time School opens.
  const [classroom, setClassroom] = useState<ClassroomConfig | null>(null);
  useEffect(() => {
    if (screen !== 'classroom' || !profile) return setClassroom(null);
    let live = true;
    void loadClassroomConfig(profile, CLASSROOM_BANK).then((c) => live && setClassroom(c));
    return () => {
      live = false;
    };
  }, [screen, profile]);

  if (profile === undefined || !hydrated) return null;
  if (profile === null) return <Onboarding initialLang={LANG} onDone={setProfile} />;
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
    if (!classroom) return <div className="cr-screen" aria-busy="true" />;
    return (
      <ClassroomScreen
        lang={lang}
        seed={SEED}
        config={classroom}
        onExit={back}
        onFinish={(r) => {
          // Practice only: stored as an event, never in learning_gain (API.md §5.1).
          track('quiz_submitted', { quiz_type: r.kind, quiz_id: r.quizId, score: r.score, answers: r.answers });
          void flush();
        }}
      />
    );
  }
  return (
    <>
      <LocationScreen
        onSelect={(id) => {
          track('location_selected', { location_id: id });
          tick();
          if (id === 'school') open('classroom');
          else if (id === 'convenience') open('store');
          else console.log('go to', id);
        }}
      />
      <MetersBar lang={lang} state={life} pop={last} />
      {screen === 'map' && eventLayer('map')}
      {screen === 'store' && (
        <StoreSheet
          lang={lang}
          state={life}
          onBuy={(kind, out) => {
            trackLife({ kind: 'buy', shop: kind }, life, out);
            apply(out);
            tick();
          }}
          onClose={back}
        />
      )}
    </>
  );
}
