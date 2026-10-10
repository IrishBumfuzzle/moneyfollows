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

**Demo:** class code `HYD234`. Facilitator sign-in is `demo.facilitator@example.org`, password `paisa-demo-2026` (local only), or use an email code. Inbucket at http://127.0.0.1:54324 shows the emails. The seeded students and quiz results are labelled demo data.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm check` | Typecheck, lint, all tests, content lint. Must pass before every commit. Needs the test Postgres (below). |
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
| `join_class(class_code, nickname)` | anyone | `{ anon_id, class_id, default_lang }`. Nickname word filter; errors `class_not_found`, `nickname_taken`, `nickname_blocked`, `nickname_invalid`, `nickname_personal_info` |
| `push_events(events)` | anyone | `{ accepted }`. Idempotent on `event_id`, at most 500 events. `quiz_submitted` also writes `quiz_attempts`; `language_changed` updates the student's language |
| `class_progress(class_id)` | facilitator | One row per student: modules done, last active, decisions per pillar, baseline and end-line scores |
| `learning_gain(class_id)` | facilitator | Baseline vs end-line percent correct by pillar |
| `classes` table | facilitator | Insert `{ name, default_lang }` to create a class. The code is generated. |

For the UI teams:
- **Translation keys.** i18n files are flat maps with dotted keys and no `t:` prefix, so configure react-i18next with `keySeparator: false`. To resolve a `TKey`, drop the `t:` prefix.
- **Month end.** After the month-end card, call `choose(state, content, CONTINUE)` to start the next month.
- **Quizzes.** Score with `scoreQuiz` from the engine, then queue a `quiz_submitted` event whose payload is `{ quiz_type, answers, score }`.
- **Offline.** `createSyncQueue({ storage: idbKeyval, push: api.pushEvents })` keeps events in IndexedDB and sends them in batches when the phone is back online.

## Guardrails

- **Educate, never recommend.** The content linter enforces this: no real brands, no promises, fictional assets only, ranges instead of single numbers, and the only safe link is 1930 / cybercrime.gov.in.
- **No runtime LLM.** Content was written once by a model at authoring time. Every item is `draft` until financial, compliance and native-Hindi review.
- **Privacy.** The only things stored about a student are a nickname, a class code and an anonymous id. Data stays in ap-south-1.
