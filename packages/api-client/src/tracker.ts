import type { SyncEvent, SyncEventType } from '@paisa/shared';
import { randomId, type FlushResult, type QueueStorage, type SyncEventPayload, type SyncQueue } from './sync-queue';

/** Who the events belong to: join_class's result. */
export interface TrackerContext {
  anon_id: string;
  class_id: string;
}

export interface TrackerOptions {
  /** Where events go once a context exists. A createSyncQueue queue fits as-is. */
  queue: Pick<SyncQueue, 'enqueue' | 'flush'>;
  /** Saves the context and the held events. idb-keyval's get/set fit as-is. */
  storage: QueueStorage;
  /** Stamped on every event (the content pack version). */
  contentVersion: string;
  /** Storage key prefix. Default 'paisa.tracker': the context and held events live under it. */
  key?: string;
  /** Events held before a context exists; beyond this the oldest are dropped. Default 100. */
  maxHeld?: number;
  /** A background write failed. track() never throws, so this is the only place it shows. */
  onError?: (err: unknown) => void;
  /** For tests. */
  now?: () => Date;
  newId?: () => string;
}

/** An event tracked before join_class returned: everything but the ids it does not have yet. */
type HeldEvent = Omit<SyncEvent, 'anon_id' | 'class_id'>;

/**
 * Fire-and-forget event tracking for the apps, in front of the sync queue.
 *
 * Onboarding sends events (language_changed on its first step) before join_class has returned
 * an anon_id, so they cannot be SyncEvents yet. Until setContext, the tracker holds them in
 * storage, each with the event_id and client_ts it got when it was tracked. setContext stamps
 * them with the student's ids, in their original order, and moves them into the queue. The
 * context is saved, so after a reload events go straight to the queue.
 *
 * All work runs one operation at a time, so events keep the order they were tracked in.
 * If the app closes after held events reach the queue but before the hold is cleared, the
 * next setContext enqueues them again: the queue and push_events both dedupe on event_id.
 */
export function createTracker(options: TrackerOptions) {
  const key = options.key ?? 'paisa.tracker';
  const contextKey = `${key}.context`;
  const heldKey = `${key}.preJoin`;
  const maxHeld = options.maxHeld ?? 100;
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomId;
  const onError = options.onError ?? ((err: unknown) => console.warn('[paisa tracker]', err));

  // undefined: not loaded from storage yet; null: no student (before join, or after clearContext).
  let context: TrackerContext | null | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  /** Runs `fn` after every earlier operation. A failure goes to the caller and never blocks later ones. */
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn);
    chain = next.catch(() => {});
    return next;
  };

  const loadContext = async (): Promise<TrackerContext | null> => {
    if (context === undefined) context = (await options.storage.get<TrackerContext | null>(contextKey)) ?? null;
    return context;
  };
  const readHeld = async () => (await options.storage.get<HeldEvent[]>(heldKey)) ?? [];
  const stamp = (e: HeldEvent, ctx: TrackerContext): SyncEvent => ({
    event_id: e.event_id,
    anon_id: ctx.anon_id,
    class_id: ctx.class_id,
    type: e.type,
    payload: e.payload,
    client_ts: e.client_ts,
    content_version: e.content_version,
  });

  return {
    /**
     * Records an event. Same shape as the app's `track(type, payload): void`; it returns at once
     * and never throws. The id and time are taken now, even if the event is held for a while.
     */
    track<T extends SyncEventType>(type: T, payload?: SyncEventPayload<T>): void {
      let held: HeldEvent;
      try {
        held = {
          event_id: newId(),
          type,
          payload: { ...(payload as Record<string, unknown> | undefined) },
          client_ts: now().toISOString(),
          content_version: options.contentVersion,
        };
      } catch (err) {
        onError(err);
        return;
      }
      serial(async () => {
        const ctx = await loadContext();
        if (ctx) return options.queue.enqueue(stamp(held, ctx));
        const queue = await readHeld();
        queue.push(held);
        await options.storage.set(heldKey, queue.slice(-maxHeld));
      }).catch(onError);
    },

    /**
     * Sets the student (join_class's anon_id and class_id), saves it, and moves every held event
     * into the queue in the order it was tracked. Calling it again is harmless, so call it after
     * join_class and on every app start with the saved profile: that also drains a hold an
     * earlier setContext could not finish.
     */
    setContext(ctx: TrackerContext): Promise<void> {
      const next: TrackerContext = { anon_id: ctx.anon_id, class_id: ctx.class_id };
      return serial(async () => {
        await options.storage.set(contextKey, next);
        context = next;
        const held = await readHeld();
        for (const e of held) await options.queue.enqueue(stamp(e, next));
        if (held.length > 0) await options.storage.set(heldKey, []);
      });
    },

    /** Forgets the student (profile switch). Later events are held until the next setContext. */
    clearContext(): Promise<void> {
      return serial(async () => {
        await options.storage.set(contextKey, null);
        context = null;
      });
    },

    /** The saved student, or null before join_class (or after clearContext). */
    getContext(): Promise<TrackerContext | null> {
      return serial(loadContext);
    },

    /**
     * Sends what the queue holds, once every event tracked so far has reached it. Call it on
     * app open and on the browser's `online` event. Held events (no student yet) are not sent.
     * It waits for earlier work but does not hold up later track() calls while it retries.
     */
    flush(): Promise<FlushResult> {
      return chain.then(() => options.queue.flush());
    },

    /** Resolves once every operation started so far has finished (for tests and app shutdown). */
    settled(): Promise<void> {
      return chain.then(() => {});
    },
  };
}

export type Tracker = ReturnType<typeof createTracker>;
