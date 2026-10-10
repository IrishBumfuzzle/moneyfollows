// Fire-and-forget analytics (CLAUDE.md 5.5: SyncEvent, push_events). Events are saved on the
// phone first and sent when online, so play never waits for the network. The tracker adds
// event_id, anon_id, class_id, client_ts and content_version. Events fired before join_class
// (language_changed on the first onboarding step) are held until the student is known.
import type { SyncEventType } from '@paisa/shared';
import type { FlushResult, SyncEventPayload } from '@paisa/api-client';
import { afterTrack, identify, syncNow, tracker } from './backend';

export type TrackType = SyncEventType;

/**
 * Records one event. Returns at once and never throws. Payload keys are checked per type
 * (push_events drops keys it doesn't list; see SyncEventPayloads in @paisa/api-client).
 */
export function track<T extends SyncEventType>(type: T, payload?: SyncEventPayload<T>): void {
  if (import.meta.env.DEV) console.info('[track]', type, payload ?? {});
  tracker.track(type, payload);
  afterTrack();
}

/** Sends queued events now, if there is a backend and a network. Never throws. */
export function flush(): Promise<FlushResult | null> {
  return syncNow();
}

/** The joined student: call after join_class and on every start with the saved profile. */
export function setStudent(anonId: string, classId: string): void {
  void identify({ anon_id: anonId, class_id: classId });
}
