// The real backend.ts module (singleton queue, tracker and useSync store) with IndexedDB and the
// api-client faked: what the banner sees as events are tracked, sent, refused or stuck.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  get: (k: string) => Promise.resolve(idb.get(k)),
  set: (k: string, v: unknown) => {
    idb.set(k, structuredClone(v));
    return Promise.resolve();
  },
}));
const api = vi.hoisted(() => ({ pushEvents: vi.fn(), classStatus: vi.fn() }));
vi.mock('@paisa/api-client/client', () => ({ createApiClient: () => api }));

const ME = { anon_id: '11111111-1111-4111-8111-111111111111', class_id: '22222222-2222-4222-8222-222222222222' };

async function load(configured = true) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', configured ? 'http://localhost:54321' : '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? 'anon-key' : '');
  const backend = await import('./backend');
  await backend.identify(ME);
  return backend;
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
}

beforeEach(() => {
  idb.clear();
  api.pushEvents.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(Math, 'random').mockReturnValue(0); // no wait between retries
  setOnline(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('syncNow', () => {
  it('sends what was tracked and tells the banner it is done', async () => {
    api.pushEvents.mockImplementation((events: unknown[]) => Promise.resolve({ accepted: events.length }));
    const { tracker, syncNow, useSync } = await load();
    tracker.track('app_open');
    tracker.track('map_opened');
    await tracker.settled();

    const r = await syncNow();
    expect(r).toMatchObject({ sent: 2, remaining: 0 });
    expect(api.pushEvents).toHaveBeenCalledOnce();
    expect(useSync.getState()).toMatchObject({ pending: 0, failed: false, syncing: false });
    expect(useSync.getState().lastSyncedAt).not.toBeNull();
  });

  it('keeps the events and reports failed while the server is unreachable, then recovers', async () => {
    const { tracker, syncNow, useSync } = await load();
    const { ApiError } = await import('@paisa/api-client'); // the copy backend.ts got after resetModules
    api.pushEvents.mockRejectedValue(new ApiError('network', 'Failed to fetch'));
    tracker.track('app_open');
    await tracker.settled();

    await syncNow();
    expect(useSync.getState()).toMatchObject({ pending: 1, failed: true, syncing: false, lastSyncedAt: null });

    api.pushEvents.mockImplementation((events: unknown[]) => Promise.resolve({ accepted: events.length }));
    await syncNow();
    expect(useSync.getState()).toMatchObject({ pending: 0, failed: false });
    expect(useSync.getState().lastSyncedAt).not.toBeNull();
  });

  it('does not touch the network while offline, but counts what is waiting', async () => {
    const { tracker, syncNow, afterTrack, useSync } = await load();
    setOnline(false);
    tracker.track('app_open');
    tracker.track('map_opened');
    afterTrack();
    await tracker.settled();

    expect(await syncNow()).toBeNull();
    expect(api.pushEvents).not.toHaveBeenCalled();
    expect(useSync.getState().pending).toBe(2);
  });

  it('with no backend configured, queues events and never sends', async () => {
    const { tracker, syncNow, backendConfigured, loadApi, useSync } = await load(false);
    expect(backendConfigured).toBe(false);
    expect(await loadApi()).toBeNull();
    tracker.track('app_open');
    await tracker.settled();
    expect(await syncNow()).toBeNull();
    expect(api.pushEvents).not.toHaveBeenCalled();
    expect(useSync.getState()).toMatchObject({ pending: 1, failed: false });
  });
});

describe('afterTrack', () => {
  it('sends a burst of events together a moment later', async () => {
    api.pushEvents.mockImplementation((events: unknown[]) => Promise.resolve({ accepted: events.length }));
    const { tracker, afterTrack, useSync } = await load();
    vi.useFakeTimers();
    tracker.track('app_open');
    afterTrack();
    tracker.track('map_opened');
    afterTrack();
    await vi.advanceTimersByTimeAsync(2100);

    expect(api.pushEvents).toHaveBeenCalledOnce();
    expect(api.pushEvents.mock.calls[0]![0]).toHaveLength(2);
    expect(useSync.getState().pending).toBe(0);
  });
});

describe('identify and forget', () => {
  it('moves events tracked before the join into the queue and sends them', async () => {
    api.pushEvents.mockImplementation((events: unknown[]) => Promise.resolve({ accepted: events.length }));
    const backend = await load();
    await backend.forget();
    backend.tracker.track('language_changed', { lang: 'hi' });
    await backend.tracker.settled();
    expect(await backend.queue.size()).toBe(0);

    await backend.identify(ME);
    await vi.waitFor(() => expect(api.pushEvents).toHaveBeenCalledOnce());
    const sent = api.pushEvents.mock.calls[0]![0] as { type: string; anon_id: string }[];
    expect(sent.map((e) => [e.type, e.anon_id])).toEqual([['language_changed', ME.anon_id]]);
  });
});
