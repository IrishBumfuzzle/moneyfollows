# BE-2: life events, persona_id, and a tracker for events before join (additive)

Date: 2026-10-11 00:55 IST. Lane: BE-2. Migration `20261011090000_life_events_persona.sql`.

## `packages/shared` (additive)

- `SyncEventType` and the zod `SyncEventSchema` enum gain `shop_purchase`, `work_shift` and
  `school_attended` (docs/life-meters-api.md section 5 on main). Existing values are unchanged.

## Backend (CLAUDE.md 5.5)

- `push_events` accepts the three life events. Payload keys kept:
  - `shop_purchase`: `kind` (`necessity` or `want`), `price`, `health`, `sanity`, `month`, `week`
  - `work_shift`: `wage`, `health`, `sanity`, `month`, `week`
  - `school_attended`: `health`, `sanity`, `month`, `week`

  `health` and `sanity` are the clamped changes and may be negative; `price` and `wage` are whole
  rupees. The events table's type CHECK and `event_payload_keys` were changed together: the life
  meters doc lists only the keys, and without the CHECK every one of these events is rejected.
- `persona_selected` and `onboarding_complete` now also keep `persona_id`, which is what the
  student app's onboarding sends. Before this the persona was silently dropped from both events.
  `personaId` is still kept for existing clients.
- A SQL test pushes one event of every type in `SyncEventSchema`'s enum and checks that the CHECK
  and the key list both cover it, so a type added to one but not the other fails CI.

## `@paisa/api-client`

- `SyncEventPayloads` types the three life events, so `makeEvent` checks their keys.
- New `createTracker({ queue, storage, contentVersion, key?, maxHeld?, onError? })`, exported with
  `Tracker`, `TrackerContext` and `TrackerOptions`:
  - `track(type, payload?)`: same shape as `apps/student/src/api/track.ts` on main. Synchronous;
    never throws (failed writes go to `onError`).
  - Before a context exists, events are held in storage (`paisa.tracker.preJoin`, at most 100,
    oldest dropped first), each with the `event_id` and `client_ts` it got when tracked.
  - `setContext({ anon_id, class_id })`: saves the student, then moves held events into the queue
    in order. Safe to repeat; call it after `join_class` and on every app start.
  - `clearContext()` (profile switch), `getContext()`, `flush()` (waits for earlier tracks, then
    flushes the queue), `settled()`.
- `makeEvent`'s default id now comes from `randomId()`, which falls back to
  `crypto.getRandomValues` where `crypto.randomUUID` is missing (a phone on plain http over the
  LAN). Same uuid v4 format.

## For UI-1

Replace the body of `apps/student/src/api/track.ts` with `tracker.track(type, payload)`, call
`tracker.setContext` after `joinClass` and when the app starts with a saved profile, and call
`tracker.flush()` on app open and on `online`. README, "For the UI teams", has the details.
