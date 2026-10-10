# BE-2: push_events returns `rejected` (additive)

Date: 2026-10-10 23:55 IST. Lane: BE-2. Nothing in `packages/shared/src` changed.

## Backend (CLAUDE.md 5.5)

`push_events(events[])` now returns `{ accepted: number, rejected: string[] }`
(migration `20261010235500_push_events_rejected.sql`).

- `rejected` lists the `event_id`, as sent, of every event the server skipped: unknown student
  or wrong class, unknown type, bad id or timestamp, oversized or malformed payload, or an id
  another student already holds. So `accepted + rejected.length` equals the batch size, except
  for array items that are not objects or carry no `event_id` string (there is no id to report).
- Each event is stored in its own subtransaction, so an integrity error on one event (for example
  a type with payload keys but missing from the events CHECK) rejects that event instead of
  failing the whole call.
- `accepted` and all validation rules are unchanged; older clients that read only `accepted`
  keep working.

## `@paisa/api-client`

- New type `PushEventsResponse = PushEventsResult & { rejected?: string[] }`; `pushEvents` and
  `SyncQueueOptions.push` use it. A `push` returning a plain `PushEventsResult` still fits.
- `DeadLetter.reason` gains `'skipped'`: the events the server listed in `rejected`. The rest of
  that batch leaves the queue as accepted.
- `onPartial` info gains an optional `rejected: SyncEvent[]`, set when only those were dead-lettered.
- Fallback: with no `rejected` (an older server), or a list that does not account for every event
  that was not accepted, the whole batch is dead-lettered as `'partial'`, as before.

## Typed map and news events (`makeEvent`)

- `SyncEventPayloads` / `SyncEventPayload<T>` (exported): the payloads of `map_opened`,
  `location_selected`, `week_slept`, `glossary_term_opened`, `news_question_answered` and
  `news_edition_completed`, with exactly the 5.5 keys. `makeEvent(ctx, type, payload)` checks
  them at compile time (a camelCase or missing key is an error, and `week_slept` needs its
  payload). Every other type keeps a free-form `Record<string, unknown>` payload, so existing
  calls compile unchanged.

## Request for BE-1

Add `rejected?: string[]` to `PushEventsResult` in `packages/shared/src/types.ts` when convenient;
the api-client type then becomes an alias.
