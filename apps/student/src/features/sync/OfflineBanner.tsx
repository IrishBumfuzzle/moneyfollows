import { useEffect, useRef, useState } from 'react';
import { syncNow, useSync } from '../../api/backend';
import { FRESH, nextBanner } from './banner';
import type { BannerKind, BannerMemory } from './banner';
import { t } from './content';
import type { Lang } from '../onboarding/types';
import './sync.css';

const SYNCED_MS = 3000;
// The full sentence is long; after a few seconds it shrinks to a one-line chip so it
// covers as little of the game as possible while the phone stays offline.
const EXPANDED_MS = 6000;

/**
 * Offline / sync status as a slim bar at the bottom of every screen (CLAUDE.md 6). Offline and
 * "All synced" never take taps (pointer-events: none), so they can't block a control under
 * them; only "Try now" does, and it appears only when sending keeps failing while online.
 */
export function OfflineBanner({ lang, top = false }: { lang: Lang; /** Onboarding: compact, at the top, clear of its Next button. */ top?: boolean }) {
  const status = useSync();
  const mem = useRef<BannerMemory>(FRESH);
  const [kind, setKind] = useState<BannerKind | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const r = nextBanner(mem.current, status);
    mem.current = r.mem;
    // 'synced' stays up for its own timer, whatever the store does meanwhile.
    setKind((prev) => r.show ?? (prev === 'synced' ? prev : null));
  }, [status.online, status.pending, status.failed, status.lastSyncedAt]);

  useEffect(() => {
    if (kind !== 'synced') return;
    const id = setTimeout(() => setKind((k) => (k === 'synced' ? null : k)), SYNCED_MS);
    return () => clearTimeout(id);
  }, [kind]);

  useEffect(() => {
    setExpanded(true);
    if (kind !== 'offline' && kind !== 'waiting') return;
    const id = setTimeout(() => setExpanded(false), EXPANDED_MS);
    return () => clearTimeout(id);
  }, [kind]);

  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const open = (expanded && !top) || kind === 'synced';
  let text = '';
  // Onboarding has nothing saved yet and cannot join offline, so there it says that instead.
  if (kind === 'offline') text = tr(top ? 'sync.offline.join' : open ? 'sync.offline' : 'sync.offline.short');
  else if (kind === 'synced') text = tr('sync.synced');
  else if (kind === 'waiting') {
    text = open
      ? tr(status.pending === 1 ? 'sync.waiting.one' : 'sync.waiting.many', { count: status.pending })
      : tr('sync.waiting.short', { count: status.pending });
  }

  // The live region stays mounted so screen readers announce each message as it appears.
  return (
    <div className={`sy-root${top ? ' is-top' : ''}`} lang={lang} role="status" aria-live="polite">
      {kind && (
        <div className={`sy-bar is-${kind} ${open ? 'is-open' : 'is-compact'}`}>
          <Icon kind={kind} />
          <span className="sy-text">{text}</span>
          {kind === 'waiting' && (
            <button className="k-btn sy-retry" disabled={status.syncing} onClick={() => void syncNow()}>
              {tr(status.syncing ? 'sync.retrying' : 'sync.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Decorative pixel-style icons: the words carry the meaning, so colour is never the only signal.
function Icon({ kind }: { kind: BannerKind }) {
  return (
    <svg className="sy-icon" viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
      {kind === 'offline' && (
        <>
          <path fill="currentColor" d="M0 5h1v2H0zM2 3h1v4H2zM4 1h1v6H4z" />
          <path stroke="currentColor" strokeWidth="1" d="M0 0L7 7" />
        </>
      )}
      {kind === 'waiting' && <path fill="currentColor" d="M3 0h1v7H3zM2 1h1v1H2zM4 1h1v1H4zM1 2h1v1H1zM5 2h1v1H5z" />}
      {kind === 'synced' && <path fill="currentColor" d="M0 3h1v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 4h1v1H3zM4 3h1v1H4zM5 2h1v1H5zM6 1h1v1H6z" />}
    </svg>
  );
}
