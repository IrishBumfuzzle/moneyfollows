import { useCallback, useEffect, useState } from 'react';
import { ClassroomScreen } from './features/classroom/ClassroomScreen';
import type { Lang } from './features/classroom/types';
import { startLife } from './features/life/life';
import { MetersBar } from './features/life/MetersBar';
import type { MeterPop } from './features/life/MetersBar';
import { StoreSheet } from './features/life/StoreSheet';
import type { LifeState } from './features/life/types';
import { LocationScreen } from './screens/LocationScreen';

type Screen = 'map' | 'classroom' | 'store';

// No router or language picker yet: ?lang=hi switches language, ?screen=classroom or
// ?screen=store opens that place directly, ?seed=N fixes the quiz (demo / tests).
const params = new URLSearchParams(window.location.search);
const LANG: Lang = params.get('lang') === 'hi' ? 'hi' : 'en';
const SEED = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);

export function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const s = params.get('screen');
    return s === 'classroom' || s === 'store' ? s : 'map';
  });
  // Life meters live here until the shared game store exists (docs/life-meters-api.md).
  // TODO: queue toLifeEvent(...) once the backend accepts the life events (§5).
  const [life, setLife] = useState<LifeState>(startLife);
  const [pop, setPop] = useState<MeterPop | null>(null);

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
  const back = useCallback(() => {
    if ((window.history.state as { screen?: Screen } | null)?.screen) window.history.back();
    else setScreen('map');
  }, []);

  if (screen === 'classroom') {
    return (
      <ClassroomScreen
        lang={LANG}
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
        onSelect={(id) => (id === 'school' ? open('classroom') : id === 'convenience' ? open('store') : console.log('go to', id))}
      />
      <MetersBar lang={LANG} state={life} pop={pop} />
      {screen === 'store' && (
        <StoreSheet
          lang={LANG}
          state={life}
          onBuy={(_, out) => {
            setLife(out.state);
            setPop((p) => ({ id: (p?.id ?? 0) + 1, delta: out.delta }));
          }}
          onClose={back}
        />
      )}
    </>
  );
}
