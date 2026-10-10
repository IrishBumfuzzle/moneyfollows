import { useCallback, useEffect, useMemo, useState } from 'react';
import { hashFor, parseHash, type Route } from './route';

/** The current route from location.hash, following back/forward. `replace` swaps the entry without adding history. */
export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const route = useMemo(() => parseHash(hash), [hash]);
  const replace = useCallback((next: Route) => {
    history.replaceState(null, '', hashFor(next));
    setHash(window.location.hash);
  }, []);
  return { route, replace };
}
