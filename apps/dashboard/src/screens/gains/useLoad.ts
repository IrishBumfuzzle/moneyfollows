import { useCallback, useEffect, useState } from 'react';

export type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** Runs `load` when `key` changes (here: the class id); `reload` tries again after an error. */
export function useLoad<T>(load: () => Promise<T>, key: string): { state: Load<T>; reload: () => void } {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true; // a stale answer (class switched, screen closed) must not overwrite a newer one
    setState({ status: 'loading' });
    load().then(
      (data) => live && setState({ status: 'ready', data }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
    // `load` is a fresh closure every render; `key` + `attempt` say when to fetch again.
  }, [key, attempt]);

  return { state, reload: useCallback(() => setAttempt((a) => a + 1), []) };
}
