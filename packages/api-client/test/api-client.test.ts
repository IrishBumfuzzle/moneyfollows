import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncEvent } from '@paisa/shared';
import {
  ApiError,
  createApiClient,
  createSyncQueue,
  isRetryableError,
  makeEvent,
  toApiError,
  type QueueStorage,
} from '../src';

const ctx = {
  anon_id: '0b1d7c8e-1e7b-4d55-8f62-7d0c4a9f3e21',
  class_id: '5a2e9c3b-4f1d-4c8a-a6e2-1b9d8c7f6e54',
  content_version: 'test',
};
let n = 0;
const event = (): SyncEvent =>
  makeEvent(
    ctx,
    'app_open',
    {},
    new Date('2026-10-10T10:00:00Z'),
    `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  );

function memory(): QueueStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(k: string) => structuredClone(data.get(k)) as T | undefined,
    set: async (k, v) => void data.set(k, structuredClone(v)),
  };
}

function fakeSupabase(rpc: (fn: string, args: unknown) => unknown) {
  return { rpc: vi.fn(async (fn: string, args: unknown) => rpc(fn, args)) } as unknown as SupabaseClient & {
    rpc: ReturnType<typeof vi.fn>;
  };
}

describe('createApiClient', () => {
  it('calls the frozen RPC names with the right argument names', async () => {
    const sb = fakeSupabase((fn) => ({
      data: fn === 'join_class' ? { anon_id: 'a', class_id: 'c', default_lang: 'hi' } : { accepted: 1 },
      error: null,
    }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    expect(await api.joinClass('ABC234', 'Asha')).toEqual({ anon_id: 'a', class_id: 'c', default_lang: 'hi' });
    expect(sb.rpc).toHaveBeenCalledWith('join_class', { class_code: 'ABC234', nickname: 'Asha' });
    const e = event();
    await api.pushEvents([e]);
    expect(sb.rpc).toHaveBeenLastCalledWith('push_events', { events: [e] });
  });

  it('passes push_events’ rejected list through pushEvents', async () => {
    const sb = fakeSupabase(() => ({ data: { accepted: 0, rejected: ['x'] }, error: null, status: 200 }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    expect(await api.pushEvents([event()])).toEqual({ accepted: 0, rejected: ['x'] });
  });

  it('maps backend errors to stable codes', async () => {
    const sb = fakeSupabase(() => ({ data: null, error: { message: 'nickname_taken', code: 'PT409' } }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    await expect(api.joinClass('ABC234', 'Asha')).rejects.toMatchObject({ code: 'nickname_taken' });
    const offline = createApiClient({
      url: 'http://x',
      anonKey: 'k',
      supabase: fakeSupabase(() => ({ data: null, error: { message: 'TypeError: Failed to fetch' } })),
    });
    await expect(offline.pushEvents([event()])).rejects.toMatchObject({ code: 'network' });
    await expect(async () => offline.pushEvents(Array.from({ length: 501 }, event))).rejects.toBeInstanceOf(ApiError);
  });

  it('turns numeric learning-gain columns into numbers', async () => {
    const sb = fakeSupabase(() => ({
      data: [{ pillar: 'stay_safe', baseline_avg: '25.0', endline_avg: null, baseline_n: 2, endline_n: 0 }],
      error: null,
    }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    expect(await api.learningGain('c')).toEqual([
      { pillar: 'stay_safe', baseline_avg: 25, endline_avg: null, baseline_n: 2, endline_n: 0 },
    ]);
  });
});

describe('makeEvent', () => {
  it('builds the map and news events with their 5.5 payload keys', () => {
    const now = new Date('2026-10-11T00:00:00Z');
    expect(makeEvent(ctx, 'location_selected', { location_id: 'convenience.phone_shop' }, now, 'id-1')).toEqual({
      event_id: 'id-1',
      ...ctx,
      type: 'location_selected',
      payload: { location_id: 'convenience.phone_shop' },
      client_ts: '2026-10-11T00:00:00.000Z',
    });
    expect(makeEvent(ctx, 'map_opened').payload).toEqual({});
    expect(
      makeEvent(ctx, 'news_question_answered', {
        edition: '2026-W41',
        article_id: 'upi_fraud',
        correct: true,
        attempt: 1,
      }).type,
    ).toBe('news_question_answered');
    expect(makeEvent(ctx, 'decision_made', { scenarioId: 'x', anything: 1 }).payload).toEqual({
      scenarioId: 'x',
      anything: 1,
    });
  });

  it('rejects wrong payload keys for the typed events at compile time', () => {
    // @ts-expect-error: payload required for week_slept
    makeEvent(ctx, 'week_slept');
    // @ts-expect-error: camelCase key (5.5 is snake_case)
    makeEvent(ctx, 'glossary_term_opened', { termId: 'inflation', article_id: 'a' });
    // @ts-expect-error: correct_count missing
    makeEvent(ctx, 'news_edition_completed', { edition: '2026-W41' });
    // @ts-expect-error: map_opened carries nothing
    makeEvent(ctx, 'map_opened', { location_id: 'home' });
    expect(true).toBe(true);
  });
});

describe('createSyncQueue', () => {
  it('keeps events offline and sends them in batches when back online', async () => {
    const storage = memory();
    let online = false;
    const push = vi.fn(async (events: SyncEvent[]) => {
      if (!online) throw new ApiError('network');
      return { accepted: events.length };
    });
    const queue = createSyncQueue({ storage, push, batchSize: 2, maxRetries: 0 });
    await Promise.all([queue.enqueue(event()), queue.enqueue(event()), queue.enqueue(event())]);
    expect(await queue.size()).toBe(3);

    const offline = await queue.flush();
    expect(offline).toMatchObject({ sent: 0, remaining: 3 });
    expect(offline.error).toBeInstanceOf(ApiError);

    online = true;
    expect(await queue.flush()).toEqual({ sent: 3, remaining: 0 });
    expect(push).toHaveBeenCalledTimes(3); // 1 failed + 2 batches
    expect(push.mock.calls.at(-1)![0]).toHaveLength(1);
  });

  it('ignores duplicate enqueues and runs one flush at a time', async () => {
    const storage = memory();
    const push = vi.fn(async (events: SyncEvent[]) => ({ accepted: events.length }));
    const queue = createSyncQueue({ storage, push });
    const e = event();
    await queue.enqueue(e);
    await queue.enqueue(e);
    expect(await queue.size()).toBe(1);
    const [a, b] = await Promise.all([queue.flush(), queue.flush()]);
    expect(a).toEqual(b);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('keeps events added while a flush is in flight', async () => {
    const storage = memory();
    let release!: () => void;
    const push = vi.fn(
      (events: SyncEvent[]) =>
        new Promise<{ accepted: number }>((r) => (release = () => r({ accepted: events.length }))),
    );
    const queue = createSyncQueue({ storage, push });
    await queue.enqueue(event());
    const flushing = queue.flush();
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    const late = event();
    await queue.enqueue(late);
    release();
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    release();
    expect(await flushing).toEqual({ sent: 2, remaining: 0 });
  });

  it('times out a hung push so flushing never gets stuck', async () => {
    const storage = memory();
    let signal: AbortSignal | undefined;
    let hang = true;
    const push = vi.fn((events: SyncEvent[], s?: AbortSignal) => {
      signal = s;
      return hang ? new Promise<{ accepted: number }>(() => {}) : Promise.resolve({ accepted: events.length });
    });
    const queue = createSyncQueue({ storage, push, timeoutMs: 20, maxRetries: 0 });
    await queue.enqueue(event());
    const stuck = await queue.flush();
    expect(stuck).toMatchObject({ sent: 0, remaining: 1 });
    expect(stuck.error).toMatchObject({ code: 'timeout' });
    expect(signal?.aborted).toBe(true);
    // The next flush runs (it is not wedged on the hung one).
    hang = false;
    expect(await queue.flush()).toEqual({ sent: 1, remaining: 0 });
  });

  it('retries network, 5xx and 429 errors with exponential backoff and jitter', async () => {
    const storage = memory();
    const failures = [
      new ApiError('network'),
      new ApiError('unknown', 'bad gateway', 502),
      new ApiError('unknown', 'slow down', 429),
    ];
    const push = vi.fn(async (events: SyncEvent[]) => {
      const f = failures.shift();
      if (f) throw f;
      return { accepted: events.length };
    });
    const delays: number[] = [];
    const queue = createSyncQueue({
      storage,
      push,
      backoffMs: 100,
      sleep: async (ms) => void delays.push(ms),
      random: () => 0.5,
    });
    await queue.enqueue(event());
    expect(await queue.flush()).toEqual({ sent: 1, remaining: 0 });
    expect(push).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([50, 100, 200]); // 100·2^n, times the jitter factor

    // After maxRetries the flush stops and keeps the events for later.
    const down = createSyncQueue({
      storage,
      push: async () => {
        throw new ApiError('network');
      },
      maxRetries: 2,
      sleep: async () => {},
    });
    await down.enqueue(event());
    const r = await down.flush();
    expect(r).toMatchObject({ sent: 0, remaining: 1 });
    expect(r.error).toMatchObject({ code: 'network' });
  });

  it('dead-letters a batch the server rejects and carries on with the next', async () => {
    const storage = memory();
    const onDeadLetter = vi.fn();
    let calls = 0;
    const push = vi.fn(async (events: SyncEvent[]) => {
      if (++calls === 1) throw toApiError({ message: 'events_must_be_an_array', code: 'PT400' });
      return { accepted: events.length };
    });
    const queue = createSyncQueue({ storage, push, batchSize: 2, onDeadLetter, sleep: async () => {} });
    const first = [event(), event()];
    for (const e of [...first, event()]) await queue.enqueue(e);
    expect(await queue.flush()).toEqual({ sent: 1, remaining: 0, deadLettered: 2 });
    expect(push).toHaveBeenCalledTimes(2); // no retries for a permanent error
    const dead = await queue.deadLetters();
    expect(dead).toEqual([
      expect.objectContaining({ reason: 'rejected', events: first, status: 400, error: 'events_must_be_an_array' }),
    ]);
    expect(onDeadLetter).toHaveBeenCalledTimes(1);
    // The app can put them back (push_events ignores ids it already holds).
    expect(await queue.requeueDeadLetters()).toBe(2);
    expect(await queue.deadLetters()).toEqual([]);
    expect(await queue.flush()).toEqual({ sent: 2, remaining: 0 });
  });

  it('surfaces a partial accepted count instead of hiding the drop', async () => {
    const storage = memory();
    const onPartial = vi.fn();
    const push = vi.fn(async (events: SyncEvent[]) => ({ accepted: events.length - 1 }));
    const queue = createSyncQueue({ storage, push, onPartial });
    const batch = [event(), event(), event()];
    for (const e of batch) await queue.enqueue(e);
    expect(await queue.flush()).toEqual({ sent: 3, remaining: 0, dropped: 1, deadLettered: 3 });
    expect(onPartial).toHaveBeenCalledWith({ batch, accepted: 2 });
    expect(await queue.deadLetters()).toEqual([
      expect.objectContaining({ reason: 'partial', accepted: 2, events: batch }),
    ]);
  });

  it('dead-letters only the events the server lists as rejected and drops the accepted rest', async () => {
    const storage = memory();
    const onPartial = vi.fn();
    const batch = [event(), event(), event()];
    const bad = batch[1]!;
    const push = vi.fn(async (events: SyncEvent[]) => ({
      accepted: events.filter((e) => e.event_id !== bad.event_id).length,
      rejected: events.some((e) => e.event_id === bad.event_id) ? [bad.event_id] : [],
    }));
    const queue = createSyncQueue({ storage, push, onPartial });
    for (const e of batch) await queue.enqueue(e);
    expect(await queue.flush()).toEqual({ sent: 3, remaining: 0, dropped: 1, deadLettered: 1 });
    expect(await queue.size()).toBe(0);
    expect(onPartial).toHaveBeenCalledWith({ batch, accepted: 2, rejected: [bad] });
    expect(await queue.deadLetters()).toEqual([expect.objectContaining({ reason: 'skipped', events: [bad] })]);
    // The next flush sends nothing again: the good events left the queue.
    expect(await queue.flush()).toEqual({ sent: 0, remaining: 0 });
    expect(push).toHaveBeenCalledTimes(1);
    expect(await queue.requeueDeadLetters()).toBe(1);
    expect(await queue.size()).toBe(1);
  });

  it('falls back to dead-lettering the whole batch when `rejected` does not account for the drop', async () => {
    const storage = memory();
    const batch = [event(), event(), event()];
    // 1 accepted + 1 listed (plus an id that was never sent) leaves one event unaccounted for.
    const push = vi.fn(async () => ({ accepted: 1, rejected: [batch[0]!.event_id, 'not-in-batch'] }));
    const queue = createSyncQueue({ storage, push });
    for (const e of batch) await queue.enqueue(e);
    expect(await queue.flush()).toEqual({ sent: 3, remaining: 0, dropped: 2, deadLettered: 3 });
    expect(await queue.deadLetters()).toEqual([
      expect.objectContaining({ reason: 'partial', accepted: 1, events: batch }),
    ]);
  });
});

describe('isRetryableError', () => {
  it('retries network trouble, 5xx, 408, 429 and unknown 4xx from proxies, not malformed requests', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableError(new ApiError('network'))).toBe(true);
    expect(isRetryableError(new ApiError('timeout'))).toBe(true);
    expect(isRetryableError(new ApiError('unknown', 'x', 503))).toBe(true);
    expect(isRetryableError(toApiError({ message: 'slow down', code: 'PT429' }))).toBe(true);
    expect(isRetryableError(new ApiError('unknown', 'x', 400))).toBe(false);
    expect(isRetryableError(toApiError({ message: 'too_many_events', code: 'PT413' }))).toBe(false);
    expect(isRetryableError(new ApiError('too_many_events'))).toBe(false);
    // Something in between answered, not the server about these events: keep them queued.
    for (const status of [401, 403, 404, 407]) expect(isRetryableError(new ApiError('unknown', 'x', status))).toBe(true);
    expect(isRetryableError(new ApiError('unknown', 'x', 422))).toBe(false);
    // The server's own codes stay permanent whatever their status.
    expect(isRetryableError(toApiError({ message: 'class_closed', code: 'PT403' }))).toBe(false);
    expect(isRetryableError(toApiError({ message: 'rejoin_failed', code: 'PT404' }))).toBe(false);
  });

  it('keeps an offline backlog queued when a proxy answers 403 instead of dead-lettering it', async () => {
    const storage = memory();
    let blocked = true;
    const push = vi.fn(async (events: SyncEvent[]) => {
      if (blocked) throw new ApiError('unknown', 'Forbidden', 403);
      return { accepted: events.length };
    });
    const queue = createSyncQueue({ storage, push, batchSize: 1, maxRetries: 0 });
    await queue.enqueue(event());
    await queue.enqueue(event());
    expect(await queue.flush()).toMatchObject({ sent: 0, remaining: 2 });
    expect(await queue.deadLetters()).toEqual([]);
    blocked = false;
    expect(await queue.flush()).toMatchObject({ sent: 2, remaining: 0 });
  });
});
