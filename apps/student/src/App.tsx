import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@paisa/shared';
import { useClassStatus } from './api/classStatus';
import { quizSubmittedPayload } from './api/payloads';
import { flush, track } from './api/track';
import { useBackendSync } from './api/useBackendSync';
import { ErrorBoundary } from './ErrorBoundary';
import { CLASSROOM_BANK } from './features/classroom/content';
import { ClassroomScreen } from './features/classroom/ClassroomScreen';
import { loadClassroomConfig } from './features/classroom/config';
import type { ClassroomConfig } from './features/classroom/config';
import { PhoneLayer, SuddenEventSheet, triggerEvent, useEvents } from './features/events';
import { IncomingCall, PhoneScreen } from './features/phone';
import type { PhoneNav } from './features/phone';
import { lifeApi, workSourceId } from './features/life/life';
import { MetersBar } from './features/life/MetersBar';
import { StoreSheet } from './features/life/StoreSheet';
import { trackLife } from './features/life/track';
import { t as mainT } from './features/main/content';
import { MainScreen } from './features/main/MainScreen';
import { PaisaTimes } from './features/news';
import { Onboarding, loadProfile } from './features/onboarding';
import { CounterShift } from './features/store';
import { OfflineBanner } from './features/sync/OfflineBanner';
import type { Profile } from './features/onboarding';
import { useStoresHydrated } from './game/hydration';
import { useGame } from './game/useGame';
import { LocationScreen } from './screens/LocationScreen';
import './design/kenney.css';

type Screen = 'main' | 'map' | 'classroom' | 'store' | 'counter' | 'news' | 'phone';
const SCREENS: Screen[] = ['main', 'map', 'classroom', 'store', 'counter', 'news', 'phone'];

// No router or language picker yet: ?lang=hi switches language, ?screen=map|classroom|store|counter|news|phone
// opens that screen directly, ?seed=N fixes the quiz, ?event=<id> fires an event (demo / tests).
const params = new URLSearchParams(window.location.search);
const LANG: Lang = params.get('lang') === 'hi' ? 'hi' : 'en';
const SEED = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);

const screenOf = (state: unknown): Screen => (state as { screen?: Screen } | null)?.screen ?? 'main';

export function App() {
  const [profile, setProfile] = useState<Profile | null>();
  // Sync, the student's ids for the tracker, and class_status (end-line gate, rejoin code).
  const refreshStatus = useBackendSync(profile, setProfile);
  // The language picked in onboarding, for the banner while there is no profile yet.
  const [obLang, setObLang] = useState<Lang>();
  const lang: Lang = params.has('lang') || !profile ? LANG : profile.lang; // ?lang= overrides for demos and tests
  return (
    <ErrorBoundary lang={lang}>
      <Game profile={profile} setProfile={setProfile} lang={lang} onLang={setObLang} onOpenClassroom={refreshStatus} />
      <OfflineBanner lang={profile ? lang : (obLang ?? LANG)} top={profile === null} />
    </ErrorBoundary>
  );
}

function Game({ profile, setProfile, lang, onLang, onOpenClassroom }: {
  profile: Profile | null | undefined;
  setProfile: (p: Profile | null) => void;
  lang: Lang;
  onLang: (lang: Lang) => void;
  /** The Classroom just opened: re-read the class settings (the teacher may have opened the end-line). */
  onOpenClassroom: () => void;
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
  const endlineOpen = useClassStatus((s) => s.endlineOpen);

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

  const pops = useRef(0); // popstate events seen, for back()'s fallback
  // Each screen is a history entry, so Android's back button goes up a level (place → map →
  // main screen) instead of leaving the app (CLAUDE.md 6). Paisa Times adds its own levels.
  useEffect(() => {
    const on = (e: PopStateEvent) => {
      pops.current += 1;
      setScreen(screenOf(e.state));
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const open = (s: Screen) => {
    window.history.pushState({ screen: s }, '');
    setScreen(s);
  };
  const parentOf = (s: Screen): Screen => (s === 'counter' ? 'store' : s === 'store' || s === 'classroom' ? 'map' : 'main');
  const back = useCallback(() => {
    const from = screenOf(window.history.state);
    if (!(window.history.state as { screen?: Screen } | null)?.screen) return setScreen((s) => parentOf(s));
    const before = pops.current;
    window.history.back();
    // If the browser drops the step (no earlier entry in this tab), no popstate arrives: go up a
    // level anyway. Counting popstates (not reading the screen) means a quick re-open within the
    // wait is never undone.
    window.setTimeout(() => {
      if (pops.current === before) setScreen(parentOf(from));
    }, 400);
  }, []);

  // First launch shows onboarding; afterwards the saved profile skips it. undefined = still reading IndexedDB.
  // useBackendSync (App) tells the tracker who the student is once the profile is set.
  useEffect(() => {
    void loadProfile().then((p) => setProfile(p ?? null));
  }, [setProfile]);

  useEffect(() => {
    if (screen === 'classroom') onOpenClassroom();
  }, [screen, onOpenClassroom]);

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
  if (profile === null) return <Onboarding initialLang={LANG} onLang={onLang} onDone={setProfile} />;
  const name = mainT(lang, `persona.${profile.persona}.name`);
  // Opens the phone at its home screen, an app, or an item; one history entry per level so
  // Android back walks out the same way (item → app → home → back here).
  const openPhone = (to: PhoneNav = {}) => {
    window.history.pushState({ screen: 'phone' }, '');
    if (to.app) window.history.pushState({ screen: 'phone', app: to.app }, '');
    if (to.app && to.item) window.history.pushState({ screen: 'phone', app: to.app, item: to.item }, '');
    setScreen('phone');
  };
  // Events and messages only surface on the map and main screen, never over a scene (CLAUDE.md 5.8).
  const eventLayer = (where: 'map' | 'main') => (
    <>
      <PhoneLayer lang={lang} name={name} where={where} onOpen={(thread) => openPhone(thread ? { app: 'messages', item: thread } : {})} />
      <IncomingCall lang={lang} name={name} onAnswer={(id) => openPhone({ app: 'calls', item: id })} />
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
  if (screen === 'phone') return <PhoneScreen lang={lang} name={name} profile={profile} onExit={back} />;
  if (screen === 'classroom') {
    if (!classroom) return <div className="cr-screen" aria-busy="true" />;
    return (
      <ClassroomScreen
        lang={lang}
        seed={SEED}
        config={classroom}
        endlineOpen={endlineOpen === true}
        onExit={back}
        onFinish={(r) => {
          // Practice rounds stay events; the start- and end-of-term checks also feed learning_gain.
          track('quiz_submitted', quizSubmittedPayload(r));
          void flush();
        }}
      />
    );
  }
  const worked = life.earned.includes(workSourceId(life));
  if (screen === 'counter') {
    return (
      <CounterShift
        lang={lang}
        // A new customer queue each week; ?seed= fixes it for demos and tests.
        seed={(SEED + life.month * 8 + life.week) >>> 0}
        practice={worked}
        onFinish={(wage) => {
          // One paid shift a week (lifeApi.work blocks a second); practice pays nothing.
          if (!worked) apply(lifeApi.work(useGame.getState().life, wage));
        }}
        onExit={back}
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
          worked={worked}
          onWork={() => open('counter')}
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
