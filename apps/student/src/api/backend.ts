// The student app's one door to the backend (CLAUDE.md 6): the api-client, the offline sync
// queue and the event tracker, each created once. supabase-js is loaded lazily, so it stays out
// of the first download. With no backend configured (local dev without .env, CI builds) the app
// still works: joins use an offline stand-in and events wait in the queue.
import { create } from 'zustand';
import { get, set } from 'idb-keyval';
import {
  ApiError,
  createSyncQueue,
  createTracker,
  type ApiClient,
  type FlushResult,
  type QueueStorage,
  type SyncQueueOptions,
  type TrackerContext,
} from '@paisa/api-client';

/** Stamped on every event. The student app's content packs are versioned per feature; this names the build. */
export const CONTENT_VERSION = 'student-2026-10-11';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** False when the build has no Supabase URL or anon key: joins are offline stand-ins and nothing is sent. */
export const backendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let apiPromise: Promise<ApiClient | null> | undefined;

/** The api-client, loaded on first use; null when no backend is configured. Rejects if the chunk can't load (offline). */
export function loadApi(): Promise<ApiClient | null> {
  if (!backendConfigured) return Promise.resolve(null);
  apiPromise ??= import('@paisa/api-client/client')
    .then((m) => m.createApiClient({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }))
    .catch((err: unknown) => {
      apiPromise = undefined; // try again next time (e.g. the chunk failed to load offline)
      throw err;
    });
  return apiPromise;
}

/** The browser's own idea of being online (true when it can't tell, e.g. in node). */
export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** What the offline / sync banner shows (CLAUDE.md 6: status as a banner, not a screen). */
export interface SyncStatus {
  online: boolean;
  /** Events saved on the phone and not yet accepted by the server. */
  pending: number;
  syncing: boolean;
  /** The last send failed (offline, server down); the events are still queued. */
  failed: boolean;
  /** ISO time of the last send that delivered something. */
  lastSyncedAt: string | null;
}

export const useSync = create<SyncStatus>(() => ({
  online: isOnline(),
  pending: 0,
  syncing: false,
  failed: false,
  lastSyncedAt: null,
}));

/** idb-keyval fits QueueStorage as-is; all keys share the default store with the game saves. */
const idbStorage: QueueStorage = { get, set };

/** Builds the queue + tracker pair. Exported for tests, which pass in-memory storage and a fake push. */
export function createBackend(options: {
  storage: QueueStorage;
  push: SyncQueueOptions['push'];
  contentVersion?: string;
  /** Tests: no retries or real timers. */
  queueOptions?: Partial<SyncQueueOptions>;
}) {
  const queue = createSyncQueue({
    ...options.queueOptions,
    storage: options.storage,
    push: options.push,
    onDeadLetter: (entry) => console.warn('[sync] server refused', entry.events.length, 'event(s):', entry.reason, entry.code ?? ''),
  });
  const tracker = createTracker({
    queue,
    storage: options.storage,
    contentVersion: options.contentVersion ?? CONTENT_VERSION,
  });
  return { queue, tracker };
}

const backend = createBackend({
  storage: idbStorage,
  push: async (events, signal) => {
    const api = await loadApi();
    if (!api) throw new ApiError('network', 'no backend configured');
    return api.pushEvents(events, signal);
  },
});

export const { queue, tracker } = backend;

async function refreshPending(): Promise<void> {
  try {
    useSync.setState({ pending: await queue.size() });
  } catch {
    // IndexedDB unavailable (private mode): nothing is queued, so nothing to show
  }
}

/**
 * Sends everything queued. Safe to call often: it runs one send at a time and does nothing
 * while offline or when no backend is configured. Never throws.
 */
export async function syncNow(): Promise<FlushResult | null> {
  if (!backendConfigured || !isOnline()) {
    await refreshPending();
    return null;
  }
  useSync.setState({ syncing: true });
  try {
    const r = await tracker.flush();
    useSync.setState({
      pending: r.remaining,
      failed: r.error !== undefined,
      ...(r.sent > 0 ? { lastSyncedAt: new Date().toISOString() } : {}),
    });
    return r;
  } catch (err) {
    console.warn('[sync]', err);
    useSync.setState({ failed: true });
    await refreshPending();
    return null;
  } finally {
    useSync.setState({ syncing: false });
  }
}

let soon: ReturnType<typeof setTimeout> | undefined;
/** Sends shortly after a burst of events, so the dashboard sees them within seconds when online. */
export function syncSoon(delayMs = 2000): void {
  clearTimeout(soon);
  soon = setTimeout(() => void syncNow(), delayMs);
}

/**
 * Sets who the events belong to (join_class's ids), moves events tracked before the join into
 * the queue and sends them. Call after join/rejoin and on every app start with the saved profile.
 */
export async function identify(ctx: TrackerContext): Promise<void> {
  try {
    await tracker.setContext(ctx);
  } catch (err) {
    console.warn('[sync] could not save the student id', err);
  }
  void syncNow();
}

/** Forgets the student (profile reset). Later events are held until the next identify. */
export function forget(): Promise<void> {
  return tracker.clearContext().catch((err: unknown) => console.warn('[sync]', err));
}

let started = false;
/**
 * Starts background sync once per page: on reconnect, when the app goes to the background,
 * and every minute while open. Returns a stop function (for tests and hot reload).
 */
export function startSync(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;
  const online = () => {
    useSync.setState({ online: true });
    void syncNow();
  };
  const offline = () => useSync.setState({ online: false });
  const hidden = () => {
    if (document.visibilityState === 'hidden') void syncNow();
  };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', hidden);
  const timer = setInterval(() => void syncNow(), 60_000);
  void syncNow();
  return () => {
    started = false;
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', hidden);
    clearInterval(timer);
  };
}

/** Called by track() after every event: counts it for the banner and schedules a send. */
export function afterTrack(): void {
  void tracker.settled().then(refreshPending);
  syncSoon();
}
