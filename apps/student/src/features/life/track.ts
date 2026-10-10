// Sends a life action (store purchase, work, school) to the backend (docs/life-meters-api.md §5).
import { track } from '../../api/track';
import { lifeEvent } from './life';
import type { LifeAction } from './life';
import type { LifeOutcome, LifeState } from './types';

export function trackLife(action: LifeAction, before: LifeState, outcome: LifeOutcome<LifeState>): void {
  const e = lifeEvent(action, before, outcome);
  // The payload shapes match the api-client's typed SyncEventPayloads for these three types.
  if (e) track(e.type, e.payload as never);
}
