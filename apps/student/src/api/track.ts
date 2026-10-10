// Fire-and-forget analytics (CLAUDE.md 5.5: SyncEvent, push_events). Events are saved on the
// phone first and sent when online, so play never waits for the network. The tracker adds
// event_id, anon_id, class_id, client_ts and content_version. Events fired before join_class
// (language_changed on the first onboarding step) are held until identify() runs.
import type { SyncEventType } from '@paisa/shared';
import type { SyncEventPayload } from '@paisa/api-client';
import { afterTrack, tracker } from './backend';

export type TrackType = SyncEventType;

/**
 * Records one event. Returns at once and never throws. Payload keys are checked per type
 * (push_events drops keys it doesn't list; see SyncEventPayloads in @paisa/api-client).
 */
export function track<T extends SyncEventType>(type: T, payload?: SyncEventPayload<T>): void {
  tracker.track(type, payload);
  afterTrack();
}
