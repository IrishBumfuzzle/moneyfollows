# BE-2: frontend integration (additive)

Date: 2026-10-11 01:55 IST. Lane: BE-2 (integrator). No type was renamed or removed.

## packages/shared/package.json

- `"sideEffects": false`. Not a type change. It lets the apps' bundler drop zod when they only
  import types or constants: importing `SYNC_BATCH_MAX` alone pulled in about 29 KB gzip of zod.

## @paisa/api-client

- `"sideEffects": false`, plus a subpath export `@paisa/api-client/client` (`createApiClient` only),
  so the student app can load supabase-js lazily and keep it out of the first download.
- Staff auth, for the dashboard:
  - `signInWithPassword(email, password)`: for the local demo facilitator only (`supabase/seed.sql`).
    Hosted staff have no password and use the email code.
  - `currentEmail(): Promise<string | null>` reads the saved session, with no network call.
  - `onAuthChange(cb): () => void` calls `cb(email | null)` on sign-in, sign-out and refresh, and
    returns an unsubscribe function.
  - `isStaff(): Promise<boolean>` wraps the existing `is_staff()` RPC. A signed-in user who is not on
    the allowlist sees no classes, so the dashboard explains that instead of showing an empty list.
- New `ApiErrorCode`s from `signInWithEmail`, `verifyEmailCode` and `signInWithPassword`, via
  `toAuthError` (exported):
  - `auth_code_invalid`: the code is wrong or expired, or the password is wrong.
  - `auth_rate_limited`: too many codes were requested.
  - `auth_not_invited`: there is no accepted invite (`signup_disabled`).

  These calls used to return `unknown` with the GoTrue message.

- `isRetryableError`: an `unknown`-code 4xx is now retried, except 400, 413 and 422. That
  covers a school proxy's 403 or 407, an expired key's 401, and PostgREST's 404 right after a
  migration. Known codes (`class_closed`, `rejoin_failed`, `too_many_events`) stay permanent.
  Before this, one such answer dead-lettered a phone's whole offline backlog in a single flush.

## Apps

- The student app no longer uses stubs. It goes through `apps/student/src/api/`:
  - `joinClass` / `rejoinClass` call the real RPCs.
  - `track` sends to the api-client tracker and the IndexedDB sync queue.
  - `classStatus` runs on app open.
- `apps/dashboard` exists, built on the api-client.
