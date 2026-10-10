import { SYNC_BATCH_MAX, type PushEventsResult, type SyncEvent, type SyncEventType } from '@paisa/shared';
import { ApiError, isRetryableError } from './errors';

/** Any async key-value store. idb-keyval's get/set fit as-is. */
export interface QueueStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * push_events' result. `rejected` is additive (newer servers only): the event_id of every
 * event the server skipped, so the queue can dead-letter just those.
 */
export type PushEventsResponse = PushEventsResult & { rejected?: string[] };

/** A batch the queue gave up on. Kept so the app can show, export or re-queue it. */
export interface DeadLetter {
  /**
   * 'rejected': the server refused the batch (4xx, validation). 'partial': it accepted fewer
   * events than sent and did not say which (an older server). 'skipped' (additive): the events
   * the server listed in `rejected`; the rest of their batch was accepted.
   */
  reason: 'rejected' | 'partial' | 'skipped';
  events: SyncEvent[];
  /** For 'partial': how many of `events` the server accepted. */
  accepted?: number;
  /** For 'rejected': the error message and code. */
  error?: string;
  code?: string;
  status?: number;
  /** ISO time it was dead-lettered. */
  at: string;
}

export interface SyncQueueOptions {
  storage: QueueStorage;
  /** api.pushEvents fits as-is; `signal` is aborted when the request times out. */
  push: (events: SyncEvent[], signal?: AbortSignal) => Promise<PushEventsResponse>;
  key?: string;
  batchSize?: number;
  /** Per-request timeout in ms. Default 15 000. */
  timeoutMs?: number;
  /** Retries per batch within one flush for retryable errors. Default 3. */
  maxRetries?: number;
  /** First backoff in ms; doubles each retry, capped at 30 s, with full jitter. Default 1000. */
  backoffMs?: number;
  /**
   * Called when the server accepted fewer events than a batch held. `rejected` (additive) is set
   * when the server said which: only those are dead-lettered. Otherwise the whole batch is.
   */
  onPartial?: (info: { batch: SyncEvent[]; accepted: number; rejected?: SyncEvent[] }) => void;
  /** Called whenever a batch is moved to the dead-letter store. */
  onDeadLetter?: (entry: DeadLetter) => void;
  /** Override which errors are retried (default: isRetryableError). */
  isRetryable?: (err: unknown) => boolean;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface FlushResult {
  /** Events in batches the server answered (including partially accepted batches). */
  sent: number;
  remaining: number;
  /** Set when the flush stopped early (offline, timeout, server error). Those events stay queued. */
  error?: unknown;
  /** Additive, only set when > 0: events the server did not accept from batches it answered. */
  dropped?: number;
  /** Additive, only set when > 0: events moved to the dead-letter store in this flush. */
  deadLettered?: number;
}

const MAX_BACKOFF_MS = 30_000;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Offline event queue. Events are saved first and sent in batches when online.
 * push_events is idempotent on event_id, so re-sending after a dropped
 * connection never duplicates anything.
 *
 * Failures: retryable errors (network, timeout, 5xx, 429) are retried with
 * exponential backoff, then the flush stops and the events stay queued.
 * Permanent errors (other 4xx, validation) move the batch to a dead-letter store
 * and the flush carries on with the next batch. When the server skips some events
 * of a batch, only the ones it lists in `rejected` are dead-lettered and the rest
 * leave the queue. An older server that sends no `rejected` (or a list that does not
 * add up) gets the whole batch dead-lettered, so drops are never silent; re-queueing
 * it is safe because accepted events are ignored the second time.
 */
export function createSyncQueue(options: SyncQueueOptions) {
  const key = options.key ?? 'paisa.syncQueue';
  const deadKey = `${key}.deadLetter`;
  const batchSize = Math.min(options.batchSize ?? SYNC_BATCH_MAX, SYNC_BATCH_MAX);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 3;
  const backoffMs = options.backoffMs ?? 1000;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const retryable = options.isRetryable ?? isRetryableError;

  let flushing: Promise<FlushResult> | null = null;
  // Serialise writes so concurrent enqueues never lose an event.
  let chain: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  const read = async () => (await options.storage.get<SyncEvent[]>(key)) ?? [];
  const readDead = async () => (await options.storage.get<DeadLetter[]>(deadKey)) ?? [];

  const removeFromQueue = (batch: SyncEvent[]) => {
    const ids = new Set(batch.map((e) => e.event_id));
    return locked(async () =>
      options.storage.set(
        key,
        (await read()).filter((e) => !ids.has(e.event_id)),
      ),
    );
  };

  const deadLetter = async (entry: DeadLetter) => {
    await locked(async () => options.storage.set(deadKey, [...(await readDead()), entry]));
    await removeFromQueue(entry.events);
    options.onDeadLetter?.(entry);
  };

  /** One push with a hard timeout, so a hung request can never wedge `flushing`. */
  const pushOnce = async (batch: SyncEvent[]): Promise<PushEventsResponse> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ApiError('timeout', `push timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    });
    try {
      const request = Promise.resolve().then(() => options.push(batch, controller.signal));
      request.catch(() => {}); // a late rejection after the timeout is not unhandled
      return await Promise.race([request, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  const backoff = (attempt: number) => Math.min(MAX_BACKOFF_MS, backoffMs * 2 ** attempt) * random();

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

    /** Batches the queue gave up on, oldest first. */
    deadLetters(): Promise<DeadLetter[]> {
      return readDead();
    },

    /** Moves every dead-lettered event back into the queue. Returns how many. */
    requeueDeadLetters(): Promise<number> {
      return locked(async () => {
        const dead = await readDead();
        const queue = await read();
        const held = new Set(queue.map((e) => e.event_id));
        let n = 0;
        for (const entry of dead) {
          for (const e of entry.events) {
            if (held.has(e.event_id)) continue;
            held.add(e.event_id);
            queue.push(e);
            n += 1;
          }
        }
        await options.storage.set(key, queue);
        await options.storage.set(deadKey, []);
        return n;
      });
    },

    clearDeadLetters(): Promise<void> {
      return locked(() => options.storage.set(deadKey, []));
    },

    /** Sends everything queued. Safe to call often (on reconnect, on app open); runs one at a time. */
    flush(): Promise<FlushResult> {
      flushing ??= (async () => {
        let sent = 0;
        let dropped = 0;
        let deadLettered = 0;
        const result = (extra: Partial<FlushResult> & { remaining: number }): FlushResult => ({
          sent,
          ...extra,
          ...(dropped > 0 ? { dropped } : {}),
          ...(deadLettered > 0 ? { deadLettered } : {}),
        });
        try {
          for (;;) {
            const batch = (await read()).slice(0, batchSize);
            if (batch.length === 0) return result({ remaining: 0 });

            let res: PushEventsResponse | undefined;
            for (let attempt = 0; ; attempt++) {
              try {
                res = await pushOnce(batch);
                break;
              } catch (error) {
                if (!retryable(error)) {
                  await deadLetter({
                    reason: 'rejected',
                    events: batch,
                    error: error instanceof Error ? error.message : String(error),
                    code: error instanceof ApiError ? error.code : undefined,
                    status: error instanceof ApiError ? error.status : undefined,
                    at: new Date().toISOString(),
                  });
                  deadLettered += batch.length;
                  break;
                }
                if (attempt >= maxRetries) return result({ remaining: (await read()).length, error });
                await sleep(backoff(attempt));
              }
            }
            if (!res) continue; // dead-lettered: carry on with the next batch

            sent += batch.length;
            const accepted = typeof res?.accepted === 'number' ? res.accepted : 0;
            if (accepted >= batch.length) {
              await removeFromQueue(batch);
              continue;
            }
            dropped += batch.length - accepted;
            const rejected = rejectedEvents(batch, res, accepted);
            if (rejected) {
              deadLettered += rejected.length;
              await deadLetter({ reason: 'skipped', events: rejected, at: new Date().toISOString() });
              await removeFromQueue(batch);
              options.onPartial?.({ batch, accepted, rejected });
            } else {
              deadLettered += batch.length;
              await deadLetter({ reason: 'partial', events: batch, accepted, at: new Date().toISOString() });
              options.onPartial?.({ batch, accepted });
            }
          }
        } catch (error) {
          return result({ remaining: (await read()).length, error });
        } finally {
          flushing = null;
        }
      })();
      return flushing;
    },
  };
}

export type SyncQueue = ReturnType<typeof createSyncQueue>;

/**
 * The batch's events the server listed in `rejected`, or undefined when it sent no list
 * (an older server) or one that does not account for every event it did not accept.
 */
function rejectedEvents(batch: SyncEvent[], res: PushEventsResponse, accepted: number): SyncEvent[] | undefined {
  if (!Array.isArray(res.rejected)) return undefined;
  const ids = new Set(res.rejected.filter((id): id is string => typeof id === 'string'));
  const rejected = batch.filter((e) => ids.has(e.event_id));
  return accepted + rejected.length === batch.length ? rejected : undefined;
}

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
