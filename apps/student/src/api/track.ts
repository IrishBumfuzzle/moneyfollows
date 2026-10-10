// Event tracking (CLAUDE.md 5.5): track() → api-client tracker → sync queue (IndexedDB) →
// push_events. Fire-and-forget and offline-first: events made before join_class are held until
// setStudent(); events made offline wait in the queue and go out on the next flush (app start,
// coming back online, or after a few events). Without a backend configured nothing is pushed,
// but events still queue on the phone and log in dev.
import { createSyncQueue, createTracker } from '@paisa/api-client';
import type { FlushResult, SyncEventPayload } from '@paisa/api-client';
import { CONTENT_VERSION } from '@paisa/content';
import type { SyncEventType } from '@paisa/shared';
import { get, set } from 'idb-keyval';
import { api } from './client';

export type TrackType = SyncEventType;

// idb-keyval throws in private mode / blocked storage; the tracker then just keeps going.
const storage = {
  get: async <T>(key: string): Promise<T | undefined> => {
    try {
      return await get<T>(key);
    } catch {
      return undefined;
    }
  },
  set: async <T>(key: string, value: T): Promise<void> => {
    try {
      await set(key, value);
    } catch {
      /* unsaved */
    }
  },
};

const queue = createSyncQueue({
  storage,
  // flush() never runs without a backend, so this only ever calls the real push_events.
  push: (events, signal) => (api ? api.pushEvents(events, signal) : Promise.reject(new TypeError('no backend configured'))),
});

const tracker = createTracker({ queue, storage, contentVersion: CONTENT_VERSION });

const FLUSH_EVERY = 5;
let sinceFlush = 0;

export function track<T extends TrackType>(type: T, payload?: SyncEventPayload<T>): void {
  if (import.meta.env.DEV) console.info('[track]', type, payload ?? {});
  tracker.track(type, payload);
  if (++sinceFlush >= FLUSH_EVERY) void flush();
}

/** Sends queued events now, if there is a backend and a network. Never throws. */
export async function flush(): Promise<FlushResult | null> {
  if (!api || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  sinceFlush = 0;
  try {
    return await tracker.flush();
  } catch {
    return null;
  }
}

/** The joined student: call after join_class and on every start with the saved profile. */
export function setStudent(anonId: string, classId: string): void {
  void tracker.setContext({ anon_id: anonId, class_id: classId }).then(flush, () => {});
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void flush());
