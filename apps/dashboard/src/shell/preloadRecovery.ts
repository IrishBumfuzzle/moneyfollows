const KEY = 'paisa.dashboard.preload-reload';

/**
 * True the first time it is asked in a browser session, false after, so a stale deploy reloads
 * once and a chunk that is truly missing cannot loop. Blocked storage counts as "already tried".
 */
export function claimReload(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): boolean {
  try {
    if (!storage || storage.getItem(KEY)) return false;
    storage.setItem(KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * After a deploy, an open tab asks for chunk files that no longer exist and Vite fires
 * `vite:preloadError`. Reload once to pick up the new build; the error boundary handles a repeat.
 */
export function installPreloadRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      // storage blocked: claimReload(undefined) says no
    }
    if (!claimReload(storage)) return;
    event.preventDefault();
    location.reload();
  });
}
