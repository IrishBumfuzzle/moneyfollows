# Paisa Path

A mobile-first money life-simulation game for Class 11–12 students in Hyderabad, built for the Vanguard India financial-literacy hackathon. Students run a persona's money week by week, see the consequences in a safe sandbox (fictional money, rewind allowed) and learn four pillars: plan and budget, save and manage, understand investing, and stay financially safe.

`CLAUDE.md` is the source of truth for scope, contracts and ownership.

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
2. `npx supabase link --project-ref <ref>`, then `npx supabase db push` (migrations only; do not load `seed.sql` there).
3. Email: fill the `SUPABASE_SMTP_*` variables from `.env.example` in your shell, set `[auth.email.smtp] enabled = true` and run `npx supabase config push`. Sign-up is off, email confirmation is on and sign-in codes expire after 10 minutes.

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

| Command | What it does |
| --- | --- |
| `pnpm check` | Typecheck, lint, all tests, content lint. Must pass before every commit. Without the test Postgres (below) the SQL tests skip locally; in CI (`CI` set) they always run. |
| `pnpm test` | Vitest across packages, scripts and the SQL tests |
| `pnpm db:test:up` | Starts the plain Postgres the SQL tests use (port 54330) |
| `pnpm lint:content` | Guardrail linter over `packages/content` (`-- --strict` also fails on drafts; use it for release builds) |
| `pnpm seed` | Regenerates `supabase/seed.sql` from the engine and loads it into `SUPABASE_DB_URL` |
| `pnpm dev:student` / `pnpm dev:dashboard` | The two apps |

## Layout

| Path | Lane | Contents |
| --- | --- | --- |
| `packages/shared` | shared (frozen) | Contract types (CLAUDE.md 5.1), zod schemas, constants; additions in its CHANGELOG |
| `packages/engine` | BE-1 | Pure, seeded simulation: `createGame`, `nextCard`, `choose`, `rewind`, `monthReport`, `projectGrowth` |
| `packages/content` | BE-1 | 24 scenarios, 10 events, 2 personas, baseline/end-line quizzes, Scam or Safe? messages, en + hi strings, guardrails |
| `scripts` | BE-1 | `lint-content.ts`, `seed.ts` |
| `packages/api-client` | BE-2 | Typed client for the Supabase functions, staff auth, and an offline sync queue |
| `supabase` | BE-2 | Migrations (tables, RLS, functions), seed, SQL tests |
| `apps/student`, `apps/dashboard` | UI-1, UI-2 | Not in this branch yet |

## Backend API

Students never create accounts. They reach the database only through two security-definer functions. Facilitators sign in with Supabase Auth, and row-level security limits them to their own classes. Call everything through `@paisa/api-client`.

| Function | Who | Returns |
| --- | --- | --- |
| `join_class(class_code, nickname)` | anyone | `{ anon_id, class_id, default_lang }`. The code is case-insensitive. Nickname word filter. At most 300 students per class and 60 new joins per class per minute |
| `push_events(events)` | anyone | `{ accepted }`. Idempotent on `event_id`, at most 500 events. `quiz_submitted` also writes `quiz_attempts` (first attempt per type counts); `language_changed` updates the student's language |
| `class_progress(class_id)` | facilitator | One row per student: modules done, last active, decisions per pillar, baseline and end-line scores |
| `learning_gain(class_id)` | facilitator | Per pillar: `baseline_avg`, `endline_avg` (percent correct), `baseline_n`, `endline_n` and `n`. Matched students only (answers for that pillar in both quizzes), so `n` = `baseline_n` = `endline_n`. Type: `MatchedLearningGainRow` |
| `classes` table | facilitator | Insert `{ name, default_lang }` to create a class. The code is generated. |

Errors reach the apps as `ApiError` from `@paisa/api-client`, with a stable `code` (map it to a `t:` key) and the HTTP `status` when the server answered:

| `code` | From | HTTP | Meaning |
| --- | --- | --- | --- |
| `class_not_found` | `join_class` | 404 | No class with that code |
| `class_full` | `join_class` | 403 | The class already has 300 students |
| `join_rate_limited` | `join_class` | 429 | Over 60 joins to this class in the last minute; try again shortly |
| `nickname_taken` | `join_class` | 409 | Someone in the class already uses it (case-insensitive) |
| `nickname_blocked` | `join_class` | 422 | Matches the word filter |
| `nickname_invalid` | `join_class` | 422 | Not 2–20 characters of Latin or Devanagari letters, digits, space `_ . -`, or mixes scripts |
| `nickname_personal_info` | `join_class` | 422 | Looks like a phone number or email (5+ digits, or `@`) |
| `too_many_events` | `push_events` | 413 | More than 500 events in one call (the client also refuses before sending) |
| `timeout` | client | – | The request was aborted after the sync queue's `timeoutMs` (default 15 s); retried later |
| `network` | client | – | Offline or the request failed; retried later |
| `unknown` | any | any | Anything else, with the server message |

`timeout`, `network`, 5xx, 408 and 429 are retryable (`isRetryableError`). The sync queue retries those and moves batches with any other error to a dead-letter store (`deadLetters()`, `requeueDeadLetters()`, `clearDeadLetters()`), so no event is dropped silently.

For the UI teams:
- **Translation keys.** i18n files are flat maps with dotted keys and no `t:` prefix, so configure react-i18next with `keySeparator: false`. To resolve a `TKey`, drop the `t:` prefix.
- **Month end.** After the month-end card, call `choose(state, content, CONTINUE)` to start the next month.
- **Quizzes.** Score with `scoreQuiz` from the engine, then queue a `quiz_submitted` event whose payload is `{ quiz_type, answers, score }`.
- **Offline.** `createSyncQueue({ storage: idbKeyval, push: api.pushEvents })` keeps events in IndexedDB and sends them in batches when the phone is back online.

## Guardrails

- **Educate, never recommend.** The content linter enforces this: no real brands, no promises, fictional assets only, ranges instead of single numbers, and the only safe link is 1930 / cybercrime.gov.in.
- **No runtime LLM.** Content was written once by a model at authoring time. Every item is `draft` until financial, compliance and native-Hindi review.
- **Privacy.** The only things stored about a student are a nickname, a class code and an anonymous id. Data stays in ap-south-1.
