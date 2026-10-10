import { describe, expect, it, vi } from 'vitest';
import type { SyncEvent, SyncEventType } from '@paisa/shared';
import { createSyncQueue, createTracker, type QueueStorage, type TrackerOptions } from '../src';

const A = { anon_id: '0b1d7c8e-1e7b-4d55-8f62-7d0c4a9f3e21', class_id: '5a2e9c3b-4f1d-4c8a-a6e2-1b9d8c7f6e54' };
const B = { anon_id: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', class_id: '1f2e3d4c-5b6a-4978-8a6b-5c4d3e2f1a0b' };

function memory(): QueueStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(k: string) => structuredClone(data.get(k)) as T | undefined,
    set: async (k, v) => void data.set(k, structuredClone(v)),
  };
}

/** A tracker over a real sync queue, with fixed ids and times, and a push that accepts everything. */
function setup(storage = memory(), extra: Partial<TrackerOptions> = {}) {
  const push = vi.fn(async (events: SyncEvent[]) => ({ accepted: events.length, rejected: [] }));
  const queue = createSyncQueue({ storage, push });
  let n = 0;
  let second = 0;
  const tracker = createTracker({
    queue,
    storage,
    contentVersion: '2026.10.11',
    now: () => new Date(Date.UTC(2026, 9, 11, 10, 0, second++)),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    ...extra,
  });
  const queued = () => (storage.data.get('paisa.syncQueue') as SyncEvent[] | undefined) ?? [];
  const held = () => (storage.data.get('paisa.tracker.preJoin') as unknown[] | undefined) ?? [];
  return { storage, push, queue, tracker, queued, held };
}

describe('createTracker', () => {
  it('holds events tracked before a context, and never sends them', async () => {
    const { tracker, push, queued, held } = setup();
    tracker.track('language_changed', { lang: 'hi' });
    tracker.track('app_open');
    await tracker.settled();
    expect(queued()).toEqual([]);
    expect(held()).toHaveLength(2);
    await tracker.flush();
    expect(push).not.toHaveBeenCalled();
  });

  it('setContext stamps held events in order, keeping the id and time they were tracked with', async () => {
    const { tracker, push, queued, held } = setup();
    tracker.track('language_changed', { lang: 'hi' });
    tracker.track('app_open');
    await tracker.setContext(A);
    const expected: SyncEvent[] = [
      {
        event_id: '00000000-0000-4000-8000-000000000001',
        ...A,
        type: 'language_changed',
        payload: { lang: 'hi' },
        client_ts: '2026-10-11T10:00:00.000Z',
        content_version: '2026.10.11',
      },
      {
        event_id: '00000000-0000-4000-8000-000000000002',
        ...A,
        type: 'app_open',
        payload: {},
        client_ts: '2026-10-11T10:00:01.000Z',
        content_version: '2026.10.11',
      },
    ];
    expect(queued()).toEqual(expected);
    expect(held()).toEqual([]);
    await tracker.flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toEqual(expected);
  });

  it('caps the hold at 100 events, dropping the oldest', async () => {
    const { tracker, queued } = setup();
    for (let i = 0; i < 105; i++) tracker.track('map_opened');
    await tracker.setContext(A);
    expect(queued()).toHaveLength(100);
    expect(queued()[0]!.event_id).toBe('00000000-0000-4000-8000-000000000006');
    expect(queued()[99]!.event_id).toBe('00000000-0000-4000-8000-000000000105');
  });

  it('keeps the context across a new tracker, so later events go straight to the queue', async () => {
    const storage = memory();
    await setup(storage).tracker.setContext(A);
    const { tracker, queued, held } = setup(storage);
    expect(await tracker.getContext()).toEqual(A);
    tracker.track('week_slept', { month: 1, week: 2 });
    await tracker.settled();
    expect(held()).toEqual([]);
    expect(queued()).toMatchObject([{ ...A, type: 'week_slept', payload: { month: 1, week: 2 } }]);
  });

  it('keeps the tracked order while the saved context is still loading', async () => {
    const storage = memory();
    await setup(storage).tracker.setContext(A);
    const { tracker, queued } = setup(storage);
    tracker.track('app_open');
    tracker.track('map_opened');
    tracker.track('location_selected', { location_id: 'convenience.phone_shop' });
    await tracker.settled();
    expect(queued().map((e) => e.type)).toEqual(['app_open', 'map_opened', 'location_selected']);
  });

  it('is harmless to call setContext twice', async () => {
    const { tracker, queued } = setup();
    tracker.track('language_changed', { lang: 'en' });
    tracker.track('app_open');
    await tracker.setContext(A);
    await tracker.setContext(A);
    expect(queued()).toHaveLength(2);
    expect(await tracker.getContext()).toEqual(A);
  });

  it('re-sends a hold that an interrupted setContext left behind without duplicating it', async () => {
    const { storage, tracker, queued, held } = setup();
    tracker.track('app_open');
    await tracker.settled();
    // The app closed after the held event reached the queue but before the hold was cleared.
    const left = held();
    await tracker.setContext(A);
    storage.data.set('paisa.tracker.preJoin', left);
    await tracker.setContext(A);
    expect(queued()).toHaveLength(1);
    expect(held()).toEqual([]);
  });

  it('holds events again after clearContext, for the next student', async () => {
    const { tracker, queued, held } = setup();
    await tracker.setContext(A);
    tracker.track('app_open');
    await tracker.clearContext();
    tracker.track('persona_selected', { persona_id: 'ravi' });
    await tracker.settled();
    expect(queued()).toHaveLength(1);
    expect(held()).toHaveLength(1);
    expect(await tracker.getContext()).toBeNull();
    await tracker.setContext(B);
    expect(queued().map((e) => [e.anon_id, e.type])).toEqual([
      [A.anon_id, 'app_open'],
      [B.anon_id, 'persona_selected'],
    ]);
  });

  it('flush waits for events tracked just before it', async () => {
    const { tracker, push } = setup();
    await tracker.setContext(A);
    tracker.track('shop_purchase', { kind: 'want', price: 400, health: 0, sanity: 12, month: 1, week: 2 });
    const res = await tracker.flush();
    expect(res).toMatchObject({ sent: 1, remaining: 0 });
    expect(push.mock.calls[0]![0]).toMatchObject([{ type: 'shop_purchase', payload: { kind: 'want', price: 400 } }]);
  });

  it('copies the payload when tracking, so a later change to the caller’s object does not leak in', async () => {
    const { tracker, queued } = setup();
    await tracker.setContext(A);
    const payload = { month: 1, week: 1 };
    tracker.track('week_slept', payload);
    payload.week = 4;
    await tracker.settled();
    expect(queued()[0]!.payload).toEqual({ month: 1, week: 1 });
  });

  it('never throws from track: storage failures go to onError and later events still work', async () => {
    const storage = memory();
    const onError = vi.fn();
    const failing: QueueStorage = {
      get: vi.fn().mockRejectedValueOnce(new Error('idb closed')).mockImplementation(storage.get),
      set: storage.set,
    };
    const { tracker } = setup(storage, { storage: failing, onError });
    expect(() => tracker.track('app_open')).not.toThrow();
    await tracker.settled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatchObject({ message: 'idb closed' });
    tracker.track('app_open');
    await tracker.settled();
    expect(storage.data.get('paisa.tracker.preJoin')).toHaveLength(1);
  });

  it('fits the student app’s track(type, payload) stub', () => {
    const { tracker } = setup();
    // apps/student/src/api/track.ts on main: track(type, payload: Record<string, unknown> = {}): void
    const track: (type: SyncEventType, payload?: Record<string, unknown>) => void = (type, payload) =>
      tracker.track(type, payload);
    expect(() => track('onboarding_complete', { persona_id: 'sana', lang: 'hi' })).not.toThrow();
  });
});
