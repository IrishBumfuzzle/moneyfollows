import { SYNC_BATCH_MAX, type PushEventsResult, type SyncEvent, type SyncEventType } from '@paisa/shared';

/** Any async key-value store. idb-keyval's get/set fit as-is. */
export interface QueueStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface SyncQueueOptions {
  storage: QueueStorage;
  push: (events: SyncEvent[]) => Promise<PushEventsResult>;
  key?: string;
  batchSize?: number;
}

export interface FlushResult {
  sent: number;
  remaining: number;
  /** Set when the flush stopped early (offline, server error). Events stay queued. */
  error?: unknown;
}

/**
 * Offline event queue. Events are saved first and sent in batches when online.
 * push_events is idempotent on event_id, so re-sending after a dropped
 * connection never duplicates anything.
 */
export function createSyncQueue(options: SyncQueueOptions) {
  const key = options.key ?? 'paisa.syncQueue';
  const batchSize = Math.min(options.batchSize ?? SYNC_BATCH_MAX, SYNC_BATCH_MAX);
  let flushing: Promise<FlushResult> | null = null;
  // Serialise writes so concurrent enqueues never lose an event.
  let chain: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  const read = async () => (await options.storage.get<SyncEvent[]>(key)) ?? [];

  return {
    enqueue(event: SyncEvent): Promise<void> {
      return locked(async () => {
        const queue = await read();
        if (!queue.some((e) => e.event_id === event.event_id)) queue.push(event);
        await options.storage.set(key, queue);
      });
    },

    size(): Promise<number> {
      return read().then((q) => q.length);
    },

    /** Sends everything queued. Safe to call often (on reconnect, on app open); runs one at a time. */
    flush(): Promise<FlushResult> {
      flushing ??= (async () => {
        let sent = 0;
        try {
          for (;;) {
            const batch = (await read()).slice(0, batchSize);
            if (batch.length === 0) return { sent, remaining: 0 };
            await options.push(batch);
            const ids = new Set(batch.map((e) => e.event_id));
            await locked(async () =>
              options.storage.set(
                key,
                (await read()).filter((e) => !ids.has(e.event_id)),
              ),
            );
            sent += batch.length;
          }
        } catch (error) {
          return { sent, remaining: (await read()).length, error };
        } finally {
          flushing = null;
        }
      })();
      return flushing;
    },
  };
}

export type SyncQueue = ReturnType<typeof createSyncQueue>;

export interface EventContext {
  anon_id: string;
  class_id: string;
  content_version: string;
}

/** Builds a SyncEvent with a device-generated id and timestamp. */
export function makeEvent(
  ctx: EventContext,
  type: SyncEventType,
  payload: Record<string, unknown> = {},
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): SyncEvent {
  return { event_id: id, ...ctx, type, payload, client_ts: now.toISOString() };
}
