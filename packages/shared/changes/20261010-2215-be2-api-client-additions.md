# BE-2: api-client additions (additive, no change to packages/shared types)

Date: 2026-10-10 22:15 IST. Lane: BE-2. Nothing in `packages/shared/src` changed; this records the
`@paisa/api-client` surface the apps build on, next to the contracts it extends.

## Errors (`ApiErrorCode`)

New codes, all additive:

- `class_full`: `join_class`, HTTP 403. The class already has 300 students.
- `join_rate_limited`: `join_class`, HTTP 429. Over 60 joins to the class in one minute. Retryable.
- `timeout`: client-side. A push was aborted after `SyncQueueOptions.timeoutMs`. Retryable.

`ApiError` gains an optional `status` (the HTTP status, when the server answered), and
`isRetryableError(err)` is exported: `network`, `timeout`, 5xx, 408 and 429 are retryable.

## learning_gain: `MatchedLearningGainRow`

`learningGain(classId)` returns `MatchedLearningGainRow` = `LearningGainRow & { n: number }`.
Rows count matched students only: a student counts for a pillar only if both their baseline and
their end-line have answers for it. So `n` = `baseline_n` = `endline_n`. `LearningGainRow` itself is
unchanged, so code typed against it keeps compiling.

## Sync queue: `SyncQueueOptions` and the dead-letter API

`createSyncQueue(options: SyncQueueOptions)`. Only `storage` and `push` are required:

- `timeoutMs` (default 15 000): per-request timeout; `push` receives an `AbortSignal`.
- `maxRetries` (default 3) and `backoffMs` (default 1000, doubling with full jitter, capped at 30 s):
  retries of retryable errors within one flush.
- `isRetryable`: override the retry rule (default `isRetryableError`).
- `onPartial({ batch, accepted })`, `onDeadLetter(entry)`: callbacks.
- `key`, `batchSize`, plus `sleep` and `random` for tests.

Dead letters: a batch the server rejects permanently (another 4xx, or validation), or accepts only in
part, is moved to a dead-letter store instead of being dropped. `DeadLetter` =
`{ reason: 'rejected' | 'partial', events, accepted?, error?, code?, status?, at }`.

- `deadLetters()`: the stored entries, oldest first.
- `requeueDeadLetters()`: moves their events back into the queue (deduplicated by `event_id`) and
  returns the count.
- `clearDeadLetters()`: drops them.

`FlushResult` gains the optional `dropped` and `deadLettered`, set only when > 0.
