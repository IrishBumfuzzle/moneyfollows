# BE-2: class settings and rejoin (additive)

Date: 2026-10-11 12:05 IST. Lane: BE-2. Goes with
`supabase/migrations/20261011120500_class_settings_rejoin.sql`. No field was renamed or removed.

## packages/shared/src/types.ts

- `JoinClassResult` gains two optional fields, returned by `join_class` and `rejoin_class`:
  - `endline_open?: boolean`: whether the facilitator has opened the end-line quiz.
  - `rejoin_code?: string`: the student's 6-character recovery code (class-code alphabet, no
    look-alikes). Show it on the Me screen.

  They are optional so code that builds a `JoinClassResult` (the student app's stub, tests)
  keeps compiling.
- New `ClassStatus` (right after `JoinClassResult`), returned by `class_status(anon_id, class_id)`:
  `{ endline_open: boolean; default_lang: Lang; rejoin_code: string }`. `rejoin_code` is beyond
  what was asked for. It lets a student who joined before codes existed, or whose code a teacher
  reset, see the current one.

## @paisa/api-client

- Students:
  - `rejoinClass(classCode, nickname, rejoinCode): Promise<JoinClassResult>` gets an existing
    student back on a new phone. It works even when the class is closed to new joins.
  - `classStatus(anonId, classId): Promise<ClassStatus>`.
- Staff:
  - `setEndlineOpen(classId, open)`.
  - `listStudents(classId): Promise<StudentRow[]>`, where `StudentRow` =
    `{ anon_id, nickname, rejoin_code }`.
  - `resetRejoinCode(anonId): Promise<string>`.
- `ClassRow` gains `endline_open: boolean` (default `false`).
- New `ApiErrorCode` `rejoin_failed` (HTTP 404, not retryable). The error is the same whichever
  part (class code, nickname, rejoin code) is wrong. More than 20 failures for one class in 10
  minutes give `join_rate_limited` (429, retryable).

## How rejoin_failed is sent

A failed rejoin is recorded for the throttle, and a raised error would roll that record back.
So `rejoin_class` returns PostgREST's error body with HTTP status 404 instead of raising. Through
PostgREST and supabase-js this looks exactly like any other error (checked against PostgREST
v16.4 and postgrest-js 2.117.3). A direct SQL caller sees the body as the function's result.
