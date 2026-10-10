import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncEvent } from '@paisa/shared';
import { ApiError, createApiClient, createSyncQueue, makeEvent, type QueueStorage } from '../src';

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

describe('createSyncQueue', () => {
  it('keeps events offline and sends them in batches when back online', async () => {
    const storage = memory();
    let online = false;
    const push = vi.fn(async (events: SyncEvent[]) => {
      if (!online) throw new ApiError('network');
      return { accepted: events.length };
    });
    const queue = createSyncQueue({ storage, push, batchSize: 2 });
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
});
