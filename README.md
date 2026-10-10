# Paisa Path

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

Put the `API URL` and `anon key` that `supabase start` prints into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**Demo:** class code `HYD234`. Facilitator sign-in is `demo.facilitator@example.org`, password `paisa-demo-2026` (local only), or use an email code. Inbucket at http://127.0.0.1:54324 shows the emails. The seeded students and quiz results are labelled demo data. `pnpm seed` loads only into a local or CI database unless you pass `--allow-remote-demo`.

### Hosted project

1. Create the Supabase project in region **ap-south-1 (South Asia, Mumbai)**. The region is fixed at creation and cannot be set in `config.toml`. Verify it under Project Settings → General ("Region: South Asia (Mumbai)"), or with `npx supabase projects list`.
2. `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npx supabase db push` (migrations only; never load `seed.sql` there, it has a known password).
3. Auth and email: put the `SMTP_*` values in `.env` (custom SMTP is required: free projects reject custom email templates without it), check `project_id` in the `[remotes.production]` block at the end of `supabase/config.toml`, then run `set -a && . ./.env && set +a && npx supabase config push`. Then check Authentication → URL Configuration and → Emails → SMTP in the dashboard. Sign-up is off, email confirmation is on and sign-in codes are 6 digits and expire after 10 minutes.
4. Invite yourself as staff (below), then load the demo class: `SUPABASE_DB_URL=<hosted connection string> pnpm seed -- --hosted-demo you@team.org`. It loads class `HYD234` with 24 demo students and gives it to that invited account. It creates no user and no password, and re-running it replaces the demo class.

### Deploy (Vercel)

One Vercel project per app, both from this repository:

| Project   | Root Directory   | Environment variables                                                        |
| --------- | ---------------- | ---------------------------------------------------------------------------- |
| student   | `apps/student`   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SHOW_DRAFT_LANGS=false` |
| dashboard | `apps/dashboard` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                                |

Each app's `vercel.json` sets the rest: install at the workspace root with the frozen lockfile, `pnpm run build`, output `dist`, single-page rewrites, no caching of the service worker and manifest, and security headers. Keep "Include files outside the Root Directory" on (the default), because the apps import `packages/*`.

Preview deploys: connect the repository with the Vercel GitHub integration. Every pull request then gets a preview URL per app. Previews use the Preview environment variables, so point those at the same hosted project (only the demo class) or at a separate one.

Demo mode (planned, not wired in the student app yet): `https://<student>.vercel.app/?demo=1` will load the engine's seeded save (`createDemoGame`), and class code `HYD234` will join the hosted demo class from step 4.

### Staff accounts

Sign-up is disabled, and signing in alone does not make someone a facilitator. To add one, as the project owner:

1. Invite the email (Studio → Authentication → Invite user).
2. Add it to the allowlist in the SQL editor: `insert into public.staff (email) values ('name@ngo.org');` (lowercase).
3. The person clicks **Accept the invite** in the email once. After that they sign in with their email and the 6-digit code we send. A code request before the invite is accepted fails with `signup_disabled`.

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

| Command                                   | What it does                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                              | Typecheck, lint, all tests, content lint. Must pass before every commit. Without the test Postgres (below) the SQL tests skip locally; in CI (`CI` set) they always run. |
| `pnpm test`                               | Vitest across packages, scripts and the SQL tests                                                                                                                        |
| `pnpm db:test:up`                         | Starts Supabase's Postgres image (the hosted version) for the SQL tests, on port 54330                                                                                   |
| `pnpm lint:content`                       | Guardrail linter over `packages/content` (`-- --strict` also fails on drafts; use it for release builds)                                                                 |
| `pnpm seed`                               | Regenerates `supabase/seed.sql` from the engine and loads it into `SUPABASE_DB_URL`                                                                                      |
| `pnpm dev:student` / `pnpm dev:dashboard` | The two apps                                                                                                                                                             |

## Layout

| Path                             | Lane            | Contents                                                                                                            |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`                | shared (frozen) | Contract types (CLAUDE.md 5.1), zod schemas, constants; additions in its CHANGELOG                                  |
| `packages/engine`                | BE-1            | Pure, seeded simulation: `createGame`, `nextCard`, `choose`, `rewind`, `monthReport`, `projectGrowth`               |
| `packages/content`               | BE-1            | 24 scenarios, 10 events, 2 personas, baseline/end-line quizzes, Scam or Safe? messages, en + hi strings, guardrails |
| `scripts`                        | BE-1            | `lint-content.ts`, `seed.ts`                                                                                        |
| `packages/api-client`            | BE-2            | Typed client for the Supabase functions, staff auth, and an offline sync queue                                      |
| `supabase`                       | BE-2            | Migrations (tables, RLS, functions), seed, SQL tests                                                                |
| `apps/student`, `apps/dashboard` | UI-1, UI-2      | Student app scaffold (map, classroom quiz); the dashboard has only `vercel.json` so far                             |

## Backend API

Students never create accounts. They reach the database only through two security-definer functions. Facilitators sign in with Supabase Auth, and row-level security limits them to their own classes. Call everything through `@paisa/api-client`.

| Function                           | Who         | Returns                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join_class(class_code, nickname)` | anyone      | `{ anon_id, class_id, default_lang }`. The code is case-insensitive. Nickname word filter. At most 300 students per class and 60 new joins per class per minute                                                                                                                                                                                                                                                           |
| `push_events(events)`              | anyone      | `{ accepted, rejected }`. `rejected` lists the `event_id` of every skipped event (unknown student or class, unknown type, bad id, timestamp or payload); the rest are stored. Idempotent on `event_id`, at most 500 events. A baseline or end-line `quiz_submitted` also writes `quiz_attempts` (first attempt per type counts); a `classroom` one stays an event only. `language_changed` updates the student's language |
| `class_progress(class_id)`         | facilitator | One row per student: modules done, last active, decisions per pillar, baseline and end-line scores, `weeks_played` and `news_editions` (Paisa Times editions completed)                                                                                                                                                                                                                                                   |
| `learning_gain(class_id)`          | facilitator | Per pillar: `baseline_avg`, `endline_avg` (percent correct), `baseline_n`, `endline_n` and `n`. Matched students only (answers for that pillar in both quizzes), so `n` = `baseline_n` = `endline_n`. Type: `MatchedLearningGainRow`                                                                                                                                                                                      |
| `classes` table                    | facilitator | Insert `{ name, default_lang }` to create a class. The code is generated.                                                                                                                                                                                                                                                                                                                                                 |

Errors reach the apps as `ApiError` from `@paisa/api-client`, with a stable `code` (map it to a `t:` key) and the HTTP `status` when the server answered:

| `code`                   | From          | HTTP | Meaning                                                                                     |
| ------------------------ | ------------- | ---- | ------------------------------------------------------------------------------------------- |
| `class_not_found`        | `join_class`  | 404  | No class with that code                                                                     |
| `class_full`             | `join_class`  | 403  | The class already has 300 students                                                          |
| `join_rate_limited`      | `join_class`  | 429  | Over 60 joins to this class in the last minute; try again shortly                           |
| `nickname_taken`         | `join_class`  | 409  | Someone in the class already uses it (case-insensitive)                                     |
| `nickname_blocked`       | `join_class`  | 422  | Matches the word filter                                                                     |
| `nickname_invalid`       | `join_class`  | 422  | Not 2–20 characters of Latin or Devanagari letters, digits, space `_ . -`, or mixes scripts |
| `nickname_personal_info` | `join_class`  | 422  | Looks like a phone number or email (5+ digits, or `@`)                                      |
| `too_many_events`        | `push_events` | 413  | More than 500 events in one call (the client also refuses before sending)                   |
| `timeout`                | client        | –    | The request was aborted after the sync queue's `timeoutMs` (default 15 s); retried later    |
| `network`                | client        | –    | Offline or the request failed; retried later                                                |
| `unknown`                | any           | any  | Anything else, with the server message                                                      |

`timeout`, `network`, 5xx, 408 and 429 are retryable (`isRetryableError`). The sync queue retries those and moves batches with any other error to a dead-letter store (`deadLetters()`, `requeueDeadLetters()`, `clearDeadLetters()`), so no event is dropped silently. When the server skips only some events of a batch, only the ones in `rejected` are dead-lettered (`reason: 'skipped'`).

Event types `push_events` accepts, with the payload keys it keeps (any other key is dropped; values must be numbers, booleans or short id-like strings):

| `type`                   | Payload keys                                                                      |
| ------------------------ | --------------------------------------------------------------------------------- |
| `app_open`, `map_opened` | none                                                                              |
| `onboarding_complete`    | `level`, `lang`, `persona_id` (as onboarding sends it), `personaId`               |
| `persona_selected`       | `persona_id` (as onboarding sends it), `personaId`, `level`                       |
| `decision_made`          | `scenarioId`, `choiceId`, `pillar`, `month`, `week`                               |
| `rewind_used`            | `scenarioId`, `month`, `week`, `tokensLeft`                                       |
| `event_triggered`        | `eventId`, `choiceId`, `month`, `week`                                            |
| `minigame_complete`      | `game`, `correct`, `total`, `score`, `level`                                      |
| `quiz_submitted`         | `quiz_type` (`baseline`, `endline` or `classroom`), `quiz_id`, `answers`, `score` |
| `module_complete`        | `moduleId`, `pillar`                                                              |
| `badge_earned`           | `badgeId`                                                                         |
| `language_changed`       | `lang`                                                                            |
| `sync_complete`          | `count`                                                                           |
| `location_selected`      | `location_id` (a place, or a sub-map location such as `convenience.phone_shop`)   |
| `week_slept`             | `month`, `week`                                                                   |
| `glossary_term_opened`   | `term_id`, `article_id`                                                           |
| `news_question_answered` | `edition`, `article_id`, `correct`, `attempt`                                     |
| `news_edition_completed` | `edition`, `correct_count`                                                        |
| `shop_purchase`          | `kind` (`necessity` or `want`), `price`, `health`, `sanity`, `month`, `week`      |
| `work_shift`             | `wage`, `health`, `sanity`, `month`, `week`                                       |
| `school_attended`        | `health`, `sanity`, `month`, `week`                                               |

For the life events, `health` and `sanity` are the clamped changes (they can be negative), and `price` and `wage` are whole rupees.

For the UI teams:

- **Translation keys.** i18n files are flat maps with dotted keys and no `t:` prefix, so configure react-i18next with `keySeparator: false`. To resolve a `TKey`, drop the `t:` prefix.
- **Month end.** After the month-end card, call `choose(state, content, CONTINUE)` to start the next month.
- **Quizzes.** Score with `scoreQuiz` from the engine, then queue a `quiz_submitted` event whose payload is `{ quiz_type, quiz_id?, answers, score }`.
- **Events.** Build them with `makeEvent(ctx, type, payload)`; the map, news and life types are checked against the keys above at compile time.
- **Offline.** `createSyncQueue({ storage: idbKeyval, push: api.pushEvents })` keeps events in IndexedDB and sends them in batches when the phone is back online.
- **Tracking, including before joining.** `createTracker({ queue, storage: idbKeyval, contentVersion })` sits in front of the queue. `tracker.track(type, payload)` has the same shape as `apps/student/src/api/track.ts`, so that stub's body becomes `tracker.track(type, payload)`. Events tracked before `join_class` returns (onboarding's `language_changed`) are held on the device with their own id and time, up to 100. Call `tracker.setContext({ anon_id, class_id })` after `join_class`, and again on every app start with the saved profile (it is safe to repeat): held events then move into the queue in order. Call `tracker.flush()` on app open and on the browser's `online` event. `clearContext()` is for a profile switch. `track` never throws; pass `onError` to see failed writes.
