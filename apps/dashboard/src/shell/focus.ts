import { useEffect, useRef } from 'react';

// Focus only moves for people who have already used the page, so a fresh load keeps its normal start.
let interacted = false;
if (typeof document !== 'undefined') {
  const mark = () => {
    interacted = true;
  };
  document.addEventListener('pointerdown', mark, { once: true, capture: true });
  document.addEventListener('keydown', mark, { once: true, capture: true });
}

/**
 * Moves focus to the page's h1 when `key` changes (a new route or view), so keyboard and screen
 * reader users land at the top of the new page. `ready` waits for the page's content to exist.
 */
export function useFocusHeading(key: string, ready = true) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || done.current === key) return;
    done.current = key;
    if (!interacted) return;
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus();
  }, [key, ready]);
}
