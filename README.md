# MoneyFollows

Build and run instructions. `CLAUDE.md` is the source of truth for scope, contracts and ownership.

## Run it

Requires Node 20+, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env
npx supabase start          # local Supabase (Postgres, Auth, API) on 54321/54322; prints the anon key
npx supabase db reset       # applies supabase/migrations and supabase/seed.sql
pnpm dev:student            # student PWA (UI-1)
pnpm dev:dashboard          # staff dashboard (UI-2)
```

Put the `API URL` and `anon key` that `supabase start` prints into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both apps read the root `.env`. The student app runs on http://localhost:5173. The dashboard runs on http://127.0.0.1:5174, which is the local auth site URL, so keep that port. Without the two `VITE_SUPABASE_*` values, the student app still runs: joining uses an offline stand-in and events stay queued on the device. The dashboard shows a setup message instead.

**Demo:** class code `HYD234`. Facilitator sign-in is `demo.facilitator@example.org`, password `paisa-demo-2026` (local only; the dashboard's dev build has a "Use the local demo facilitator" button). Password-reset emails go out through the Gmail SMTP account in `.env` (`SMTP_*`), locally too; `supabase start` reads them from the root `.env`. The seeded students and quiz results are labelled demo data. `pnpm seed` loads only into a local or CI database unless you pass `--allow-remote-demo`.

### Hosted project

1. Create the Supabase project in region **ap-south-1 (South Asia, Mumbai)**. The region is fixed at creation and cannot be set in `config.toml`. Verify it under Project Settings → General ("Region: South Asia (Mumbai)"), or with `npx supabase projects list`.
2. `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npx supabase db push` (migrations only; never load `seed.sql` there, it has a known password).
3. Auth and email: put the `SMTP_*` values in `.env` (custom SMTP is required: free projects reject custom email templates without it), and `DASHBOARD_URL` (the deployed dashboard, https, no trailing slash; password-reset emails link there). If `config push` prints `WARN: environment variable is unset: DASHBOARD_URL`, stop: it would set the site URL to the literal text. Check `project_id` in the `[remotes.production]` block at the end of `supabase/config.toml`, then run `set -a && . ./.env && set +a && npx supabase config push`. Then check Authentication → URL Configuration and → Emails → SMTP in the dashboard. Sign-up is on but only for emails on the staff list (the `before_user_created` hook), email confirmation is off, and password-reset links work for 1 hour.
4. Invite yourself as staff (below), then load the demo class: `SUPABASE_DB_URL=<hosted connection string> pnpm seed -- --hosted-demo you@team.org`. It loads class `HYD234` with 24 demo students and gives it to that invited account. It creates no user and no password, and re-running it replaces the demo class.

### Deploy (Vercel)

One Vercel project per app, both from this repository:

| Project   | Root Directory   | Environment variables                                                        |
| --------- | ---------------- | ---------------------------------------------------------------------------- |
| student   | `apps/student`   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SHOW_DRAFT_LANGS=false` |
| dashboard | `apps/dashboard` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STUDENT_URL`            |

`VITE_STUDENT_URL` is the deployed student app (https, no trailing slash). The join QR code and link open `<VITE_STUDENT_URL>/?code=<CLASS_CODE>`, and onboarding pre-fills the code.

Each app's `vercel.json` sets the rest: install at the workspace root with the frozen lockfile, `pnpm run build`, output `dist`, single-page rewrites, no caching of the service worker and manifest, and security headers. Keep "Include files outside the Root Directory" on (the default), because the apps import `packages/*`.

Preview deploys: connect the repository with the Vercel GitHub integration. Every pull request then gets a preview URL per app. Previews use the Preview environment variables, so point those at the same hosted project (only the demo class) or at a separate one.

Demo mode (planned, not wired in the student app yet): `https://<student>.vercel.app/?demo=1` will load the engine's seeded save (`createDemoGame`), and class code `HYD234` will join the hosted demo class from step 4.

### Staff accounts

Only emails on the staff list (`public.staff`) can create an account; anyone else is refused. To add someone, as the project owner, run:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role key> DASHBOARD_URL=https://<dashboard>.vercel.app \
  pnpm staff:invite -- name@ngo.org
```

It adds the email, lowercase, to `public.staff` and prints what to tell the person. It sends no email. Running it again for the same email is harmless. The service role key is under Project Settings → API (locally, `npx supabase status`); keep it in your shell for that command only, never in a `VITE_*` variable or in git. Locally, `SUPABASE_URL` can be left out: the script falls back to `VITE_SUPABASE_URL`.

The person then opens the dashboard, taps **First time here? Create your account**, types that email and picks a password (at least 8 characters). They are signed in straight away and sign in with email + password from then on. A forgotten password: **Forgot password?** emails a link that works for 1 hour, on any device.

Without the script: `insert into public.staff (email) values ('name@ngo.org');` (lowercase) in the SQL editor.

Removing the row from `public.staff` revokes access to all their classes immediately.

### Transferring a class

A facilitator account that still owns classes cannot be deleted (`on delete restrict`), so student data is never wiped by accident. Move the classes first, in the SQL editor:

```sql
update public.classes
set facilitator_id = (select id from auth.users where email = 'new.person@ngo.org')
where facilitator_id = (select id from auth.users where email = 'old.person@ngo.org');
```

The new owner must also be in `public.staff`.

## Commands

| Command                                   | What it does                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                              | Typecheck, lint, all tests, content lint. Must pass before every commit. Without the test Postgres (below) the SQL tests skip locally; in CI (`CI` set) they always run.                               |
| `pnpm test`                               | Vitest across packages, scripts and the SQL tests                                                                                                                                                      |
| `pnpm db:test:up`                         | Starts Supabase's Postgres image (the hosted version) for the SQL tests, on port 54330. If Windows reserves that port, set `PAISA_TEST_DB_PORT` and `SUPABASE_TEST_DB_URL` to another (`.env.example`) |
| `pnpm lint:content`                       | Guardrail linter over `packages/content` (`-- --strict` also fails on drafts; use it for release builds)                                                                                               |
| `pnpm seed`                               | Regenerates `supabase/seed.sql` from the engine and loads it into `SUPABASE_DB_URL`                                                                                                                    |
| `pnpm staff:invite -- name@ngo.org`       | Adds a facilitator to the staff allowlist, so they can create their account ("Staff accounts")                                                                                                         |
| `pnpm dev:student` / `pnpm dev:dashboard` | The two apps                                                                                                                                                                                           |

## Layout

| Path                             | Lane            | Contents                                                                                                            |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`                | shared (frozen) | Contract types (CLAUDE.md 5.1), zod schemas, constants; additions in its CHANGELOG                                  |
| `packages/engine`                | BE-1            | Pure, seeded simulation: `createGame`, `nextCard`, `choose`, `rewind`, `monthReport`, `projectGrowth`               |
| `packages/content`               | BE-1            | 24 scenarios, 10 events, 2 personas, baseline/end-line quizzes, Scam or Safe? messages, en + hi strings, guardrails |
| `scripts`                        | BE-1            | `lint-content.ts`, `seed.ts`                                                                                        |
| `packages/api-client`            | BE-2            | Typed client for the Supabase functions, staff auth, and an offline sync queue                                      |
| `supabase`                       | BE-2            | Migrations (tables, RLS, functions), seed, SQL tests                                                                |
| `apps/student`, `apps/dashboard` | UI-1, UI-2      | Student PWA (talks to the backend only through `apps/student/src/api/`); staff dashboard                            |

## Backend API

Students never create accounts. They reach the database only through security-definer functions (`join_class`, `rejoin_class`, `class_status`, `push_events`). Facilitators sign in with Supabase Auth, and row-level security limits them to their own classes. Call everything through `@paisa/api-client`.

| Function                                          | Who         | Returns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `join_class(class_code, nickname, lang?)`         | anyone      | `{ anon_id, class_id, default_lang, endline_open, rejoin_code }`. The code is case-insensitive. Nickname word filter. At most 300 students per class and 60 new joins per class per minute. `lang` (`en`, `hi`, `te`, `ur`; the language picked in onboarding) is saved as the student's; without it, or with any other value, the student gets the class default. `default_lang` is always the class's. A class with `join_open = false` refuses new students (`class_closed`). `rejoin_code` is the student's 6-character recovery code for `rejoin_class` |
| `push_events(events)`                             | anyone      | `{ accepted, rejected }`. `rejected` lists the `event_id` of every skipped event (unknown student or class, unknown type, bad id, timestamp or payload); the rest are stored. Idempotent on `event_id`, at most 500 events. A baseline or end-line `quiz_submitted` also writes `quiz_attempts` (first attempt per type counts); a `classroom` one stays an event only. `language_changed` updates the student's language                                                                                                                                    |
| `class_progress(class_id)`                        | facilitator | One row per student: modules done, last active, decisions per pillar, baseline and end-line scores, `weeks_played`, `news_editions` (Paisa Times editions completed), `persona` (the latest one picked) and `classroom_best` (best classroom quiz score, null before the first round)                                                                                                                                                                                                                                                                        |
| `learning_gain(class_id)`                         | facilitator | Per pillar: `baseline_avg`, `endline_avg` (percent correct), `baseline_n`, `endline_n` and `n`. Matched students only (answers for that pillar in both quizzes), so `n` = `baseline_n` = `endline_n`. Type: `MatchedLearningGainRow`                                                                                                                                                                                                                                                                                                                         |
| `classroom_quiz_summary(class_id)`                | facilitator | One row per classroom question the class answered: `question_id`, `pillar`, `attempts` (every round counts), `students`, `correct_pct`, `top_wrong_choice` (the wrong option picked most, content order; null if nobody got it wrong). Practice rounds only; baseline and end-line answers stay out. `classroomQuizSummary(classId)`                                                                                                                                                                                                                         |
| `class_wellbeing(class_id)`                       | facilitator | One row per student from the life events: `necessity_purchases`, `want_purchases`, `want_spend` (rupees), `work_shifts`, `school_days` and `rest_days` (days with one; older events without a day count per week). Malformed purchases are skipped. `classWellbeing(classId)`                                                                                                                                                                                                                                                                                         |
| `classes` table                                   | facilitator | Insert `{ name, default_lang }` to create a class. The code is generated. Update `name`, `default_lang`, `join_open` (default `true`; `false` closes the class to new joins, students already in it keep playing: `setJoinOpen(classId, open)`) or `endline_open` (default `false`; `true` lets the class take the end-line quiz: `setEndlineOpen(classId, open)`)                                                                                                                                                                                           |
| `rotate_class_code(class_id)`                     | facilitator | The new code (text), for a leaked one. Only the owning facilitator on the staff allowlist; anyone else gets `class_not_found`, so it never confirms an id exists. The old code stops working for joins; students who already joined keep syncing (they hold `class_id`). `rotateClassCode(classId)`                                                                                                                                                                                                                                                          |
| `class_status(anon_id, class_id)`                 | anyone      | `{ endline_open, default_lang, rejoin_code }` for a joined student (type `ClassStatus`): read it on app open to know whether to offer the end-line quiz, and to show the current rejoin code. A pair that is not a student of that class gets `class_not_found`. `classStatus(anonId, classId)`                                                                                                                                                                                                                                                              |
| `rejoin_class(class_code, nickname, rejoin_code)` | anyone      | The same result as `join_class`, for an existing student on a new or reset phone, so their history continues. Case-insensitive; works even when `join_open` is false. Any wrong part gives `rejoin_failed`, never saying which. More than 20 failures for a class in 10 minutes give `join_rate_limited` until they age out. `rejoinClass(classCode, nickname, rejoinCode)`                                                                                                                                                                                  |
| `reset_rejoin_code(anon_id)`                      | facilitator | The student's new rejoin code (the old one stops working). Owning facilitator on the staff allowlist only; anyone else gets `class_not_found`. `resetRejoinCode(anonId)`. To read a code out to a student: `listStudents(classId)` (`anon_id`, `nickname`, `rejoin_code`)                                                                                                                                                                                                                                                                                    |

Errors reach the apps as `ApiError` from `@paisa/api-client`, with a stable `code` (map it to a `t:` key) and the HTTP `status` when the server answered:

| `code`                   | From                                                                                                    | HTTP | Meaning                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `class_not_found`        | `join_class`, `class_status`, `rotate_class_code`, `reset_rejoin_code`, `setJoinOpen`, `setEndlineOpen` | 404  | No class with that code (for `class_status`, not a student of that class; for staff, not one of your classes or students)                                           |
| `class_full`             | `join_class`                                                                                            | 403  | The class already has 300 students                                                                                                                                  |
| `class_closed`           | `join_class`                                                                                            | 403  | The facilitator closed the class to new joins (`join_open = false`)                                                                                                 |
| `join_rate_limited`      | `join_class`, `rejoin_class`                                                                            | 429  | Over 60 joins to this class in the last minute, or over 20 failed rejoins in 10 minutes; try again shortly                                                          |
| `nickname_taken`         | `join_class`                                                                                            | 409  | Someone in the class already uses it (case-insensitive). `ApiError.suggestions` lists up to 3 free nicknames (may be empty, or `undefined` if the server sent none) |
| `nickname_blocked`       | `join_class`                                                                                            | 422  | Matches the word filter                                                                                                                                             |
| `nickname_invalid`       | `join_class`                                                                                            | 422  | Not 2–20 characters of Latin or Devanagari letters, digits, space `_ . -`, or mixes scripts                                                                         |
| `nickname_personal_info` | `join_class`                                                                                            | 422  | Looks like a phone number or email (5+ digits, or `@`)                                                                                                              |
| `rejoin_failed`          | `rejoin_class`                                                                                          | 404  | The class code, nickname and rejoin code don't match one student. The same error whichever part is wrong                                                            |
| `too_many_events`        | `push_events`                                                                                           | 413  | More than 500 events in one call (the client also refuses before sending)                                                                                           |
| `timeout`                | client                                                                                                  | –    | The request was aborted after the sync queue's `timeoutMs` (default 15 s); retried later                                                                            |
| `network`                | client                                                                                                  | –    | Offline or the request failed; retried later                                                                                                                        |
| `unknown`                | any                                                                                                     | any  | Anything else, with the server message                                                                                                                              |

`timeout`, `network`, 5xx, 408 and 429 are retryable (`isRetryableError`), and so is an `unknown` 4xx other than 400, 413 and 422: a filtering proxy, an expired key or a function missing after a migration is not a problem with the events. The sync queue retries those and moves batches with any other error to a dead-letter store (`deadLetters()`, `requeueDeadLetters()`, `clearDeadLetters()`), so no event is dropped silently. When the server skips only some events of a batch, only the ones in `rejected` are dead-lettered (`reason: 'skipped'`).

Event types `push_events` accepts, with the payload keys it keeps (any other key is dropped; values must be numbers, booleans or short id-like strings):

| `type`                   | Payload keys                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `app_open`, `map_opened` | none                                                                                           |
| `onboarding_complete`    | `level`, `lang`, `persona_id` (as onboarding sends it), `personaId`                            |
| `persona_selected`       | `persona_id` (as onboarding sends it), `personaId`, `level`                                    |
| `decision_made`          | `scenarioId`, `choiceId`, `pillar`, `month`, `week`                                            |
| `rewind_used`            | `scenarioId`, `month`, `week`, `tokensLeft`                                                    |
| `event_triggered`        | `eventId`, `choiceId`, `month`, `week`                                                         |
| `minigame_complete`      | `game`, `correct`, `total`, `score`, `level`                                                   |
| `quiz_submitted`         | `quiz_type` (`baseline`, `endline` or `classroom`), `quiz_id`, `answers`, `score`              |
| `module_complete`        | `moduleId`, `pillar`                                                                           |
| `badge_earned`           | `badgeId`                                                                                      |
| `language_changed`       | `lang`                                                                                         |
| `sync_complete`          | `count`                                                                                        |
| `location_selected`      | `location_id` (a place, or a sub-map location such as `convenience.phone_shop`)                |
| `week_slept`             | `month`, `week`                                                                                |
| `glossary_term_opened`   | `term_id`, `article_id`                                                                        |
| `news_question_answered` | `edition`, `article_id`, `correct`, `attempt`                                                  |
| `news_edition_completed` | `edition`, `correct_count`                                                                     |
| `shop_purchase`          | `kind` (`necessity` or `want`), `price`, `health`, `sanity`, `month`, `week`                   |
| `work_shift`             | `wage`, `health`, `sanity`, `month`, `week`                                                    |
| `school_attended`        | `health`, `sanity`, `month`, `week`                                                            |
| `guide_completed`        | `guide_id` (e.g. `guide.bank_account`), `correct` (first answer to the guide's check question) |

For the life events, `health` and `sanity` are the clamped changes (they can be negative), and `price` and `wage` are whole rupees.

### Student app and the backend

The student app reaches the backend only through `apps/student/src/api/`:

- **`joinClass.ts`**:
  - `joinClass(code, nickname, lang)` and `rejoinClass(code, nickname, rejoinCode)`.
  - `ApiError` codes are mapped to `JoinError`, and onboarding shows one message per code (`features/onboarding/joinErrors.ts`).
  - `nickname_taken` offers the server's suggestions as chips.
- **`track.ts` and `backend.ts`**:
  - `track(type, payload)` saves the event in IndexedDB first. It is sent in batches a few seconds later, on reconnect, when the app goes to the background, and every minute.
  - Events from before the join (onboarding's `language_changed`) are held, then sent after `identify()`.
  - supabase-js loads lazily, so it stays out of the first download.
- **`classStatus.ts`**:
  - On app open and on reconnect it refreshes the rejoin code and the end-line gate.
  - If the server no longer knows the phone's ids (`class_not_found`), the profile is cleared and onboarding shows again. Game progress is kept.
- **`features/sync/OfflineBanner.tsx`** shows offline, "waiting to send" and "all synced" as a banner, never as a screen.

Rejoin: the rejoin code shows on the last onboarding step and on the main screen. "Played before on another phone?" on the class-code step asks for the nickname and rejoin code. The end-line check appears in School only while the teacher has it open (Class settings in the dashboard).

For the UI teams:

- **Translation keys.** i18n files are flat maps with dotted keys and no `t:` prefix, so configure react-i18next with `keySeparator: false`. To resolve a `TKey`, drop the `t:` prefix.
- **Month end.** After the month-end card, call `choose(state, content, CONTINUE)` to start the next month.
- **Quizzes.** Classroom, baseline and end-line results go out as `quiz_submitted` with `{ quiz_type, quiz_id, answers, score }` (`apps/student/src/api/payloads.ts`).
- **Events.** Build them with `makeEvent(ctx, type, payload)`; the map, news and life types are checked against the keys above at compile time.
- **Offline and tracking.** `apps/student/src/api/backend.ts` builds `createSyncQueue` and `createTracker` over idb-keyval.
  - New events: call `track(type, payload)`. It never throws.
  - Profile switch: call `forget()`.
  - Events tracked before `join_class` returns are held on the device with their own id and time, up to 100.
