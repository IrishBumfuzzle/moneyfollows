// Waits until every persisted store has read IndexedDB, so the first screen shows saved money
// and answers instead of flashing the defaults (and a tap can't race the saved state).
import { useEffect, useState } from 'react';
import { useEvents } from '../features/events/useEvents';
import { useNews } from '../features/news/useNews';
import { useWordWallet } from '../features/news/useWordWallet';
import { useGame } from './useGame';

const STORES = [useGame, useNews, useWordWallet, useEvents];

export function useStoresHydrated(): boolean {
  const all = () => STORES.every((s) => s.persist.hasHydrated());
  const [done, setDone] = useState(all);
  useEffect(() => {
    if (all()) return setDone(true);
    const offs = STORES.map((s) => s.persist.onFinishHydration(() => all() && setDone(true)));
    return () => offs.forEach((off) => off());
  }, []);
  return done;
}
