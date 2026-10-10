import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@paisa/api-client';
import type { PushEventsResponse, QueueStorage } from '@paisa/api-client';
import type { SyncEvent } from '@paisa/shared';
import { createBackend } from './backend';

const ME = { anon_id: '11111111-1111-4111-8111-111111111111', class_id: '22222222-2222-4222-8222-222222222222' };

/** In-memory stand-in for IndexedDB; `data` survives a "reload" when handed to a second backend. */
function memory(data = new Map<string, unknown>()): QueueStorage & { data: Map<string, unknown> } {
  return {
    data,
    get: <T>(key: string) => Promise.resolve(data.get(key) as T | undefined),
    set: <T>(key: string, value: T) => {
      data.set(key, structuredClone(value));
      return Promise.resolve();
    },
  };
}

const accept = (events: SyncEvent[]): Promise<PushEventsResponse> => Promise.resolve({ accepted: events.length });

function make(push: (events: SyncEvent[]) => Promise<PushEventsResponse>, storage = memory()) {
  const sent: SyncEvent[][] = [];
  const b = createBackend({
    storage,
    contentVersion: 'test-1',
    queueOptions: { maxRetries: 0, sleep: () => Promise.resolve() },
    push: (events) => {
      sent.push(events);
      return push(events);
    },
  });
  return { ...b, sent, storage };
}

beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('events before and after join', () => {
  it('holds events tracked before identify, then sends them in order with the ids and version stamped', async () => {
    const { tracker, queue, sent } = make(accept);
    tracker.track('language_changed', { lang: 'hi' });
    tracker.track('app_open');
    await tracker.settled();
    expect(await queue.size()).toBe(0); // no anon_id yet, so nothing can be sent
    expect((await tracker.flush()).sent).toBe(0);

    await tracker.setContext(ME);
    expect(await queue.size()).toBe(2);
    const r = await tracker.flush();
    expect(r).toMatchObject({ sent: 2, remaining: 0 });

    const events = sent.flat();
    expect(events.map((e) => e.type)).toEqual(['language_changed', 'app_open']);
    expect(events[0]!.payload).toEqual({ lang: 'hi' });
    for (const e of events) {
      expect(e).toMatchObject({ ...ME, content_version: 'test-1' });
      expect(e.event_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Number.isNaN(Date.parse(e.client_ts))).toBe(false);
    }
    expect(new Set(events.map((e) => e.event_id)).size).toBe(2);
  });

  it('sends events tracked after identify straight away, and remembers the student across a reload', async () => {
    const first = make(accept);
    await first.tracker.setContext(ME);
    const second = make(accept, memory(first.storage.data)); // the app restarted
    second.tracker.track('map_opened');
    second.tracker.track('location_selected', { location_id: 'school' });
    await second.tracker.settled();
    await second.tracker.flush();
    expect(second.sent.flat().map((e) => [e.type, e.anon_id, e.payload])).toEqual([
      ['map_opened', ME.anon_id, {}],
      ['location_selected', ME.anon_id, { location_id: 'school' }],
    ]);
  });

  it('forgets the student on clearContext: later events wait for the next identify', async () => {
    const { tracker, queue } = make(accept);
    await tracker.setContext(ME);
    await tracker.clearContext();
    tracker.track('app_open');
    await tracker.settled();
    expect(await queue.size()).toBe(0);
    await tracker.setContext({ anon_id: '33333333-3333-4333-8333-333333333333', class_id: ME.class_id });
    expect(await queue.size()).toBe(1);
  });
});

describe('when sending fails', () => {
  it('keeps the events queued while offline, and delivers them once, with the same ids, later', async () => {
    let online = false;
    const { tracker, queue, sent } = make((events) =>
      online ? accept(events) : Promise.reject(new ApiError('network', 'Failed to fetch')),
    );
    await tracker.setContext(ME);
    tracker.track('app_open');
    tracker.track('week_slept', { month: 1, week: 1 });
    await tracker.settled();

    const failed = await tracker.flush();
    expect(failed.sent).toBe(0);
    expect(failed.remaining).toBe(2);
    expect(failed.error).toBeInstanceOf(ApiError);
    expect(await queue.size()).toBe(2);
    expect(await queue.deadLetters()).toEqual([]);

    online = true;
    const ok = await tracker.flush();
    expect(ok).toMatchObject({ sent: 2, remaining: 0 });
    expect(sent[1]!.map((e) => e.event_id)).toEqual(sent[0]!.map((e) => e.event_id));
  });

  it('retries a server error (5xx) but gives up on a refusal (4xx) into the dead letters', async () => {
    const down = make(() => Promise.reject(new ApiError('unknown', 'boom', 503)));
    await down.tracker.setContext(ME);
    down.tracker.track('app_open');
    await down.tracker.settled();
    expect((await down.tracker.flush()).remaining).toBe(1);
    expect(await down.queue.deadLetters()).toEqual([]);

    const refused = make(() => Promise.reject(new ApiError('unknown', 'bad', 400)));
    await refused.tracker.setContext(ME);
    refused.tracker.track('app_open');
    await refused.tracker.settled();
    const r = await refused.tracker.flush();
    expect(r).toMatchObject({ remaining: 0, deadLettered: 1 });
    expect(await refused.queue.deadLetters()).toHaveLength(1);
  });

  it('dead-letters only the events the server rejected (a phone whose ids it does not know)', async () => {
    const { tracker, queue } = make((events) =>
      Promise.resolve({ accepted: events.length - 1, rejected: [events[0]!.event_id] }),
    );
    await tracker.setContext(ME);
    tracker.track('app_open');
    tracker.track('map_opened');
    await tracker.settled();
    const r = await tracker.flush();
    expect(r).toMatchObject({ sent: 2, remaining: 0, dropped: 1 });
    const dead = await queue.deadLetters();
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ reason: 'skipped' });
    expect(dead[0]!.events.map((e) => e.type)).toEqual(['app_open']);
  });
});
