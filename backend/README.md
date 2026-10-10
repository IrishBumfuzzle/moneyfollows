# Paisa Path backend

The game engine, content pipeline, API and database for Paisa Path, in one TypeScript workspace.

**Read first:** [Backend Design & Parallel Plan](../docs/Paisa%20Path%20—%20Backend%20Design%20%26%20Parallel%20Plan.md). It covers the plan, the two-track split, seams, rules and task IDs.

## Setup

Requires Node 22.12+ and Docker.

```bash
cp .env.example .env
npm install
npm run db:up        # Postgres 17 in Docker
npm run check        # boundaries + typecheck + content lint + all tests
npm run seed         # demo NGO, class HYD234 and 24 students (labelled demo data)
npm run dev          # http://localhost:3000/health, docs at /v1/openapi.json
```

The API applies pending migrations when it starts. Tests create and drop their own databases on the server in `DATABASE_URL` (or `TEST_DATABASE_URL`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run check` | Boundary rules, typecheck, content lint and all tests (what CI runs) |
| `npm test` | All tests (`npx vitest run packages/engine` for one package) |
| `npm run typecheck` | `tsc` in every workspace |
| `npm run check:boundaries` | Import direction, deep imports, engine/contracts purity |
| `npm run lint:content` | Validate and guardrail-lint `content/fixtures`, and `content/hyderabad` in strict mode |
| `npm run play -- [dir] [--persona sana] [--level 2] [--seed 42]` | Play the engine in the terminal against a content folder (fixtures by default) |
| `npm run dev` / `npm start` | API with / without reload |
| `npm run seed` / `npm run seed -- --reset` | Load (or reload) the demo data |
| `npm run retention` | Unlink students from classes whose programme has ended (run daily) |
| `npm run db:up` / `npm run db:down` | Local Postgres 17 |
| `npm run db:generate` / `npm run db:migrate` | Create / apply Drizzle migrations |

## Layout

| Path | Owner | Contents |
| --- | --- | --- |
| `packages/contracts` | shared | zod schemas and types shared by every package (v0.2, see its CHANGELOG) |
| `packages/engine` | Track A | Pure, seeded game simulation: clock, income, jars, selector, events, delayed effects, score, rewind, lessons, quizzes, rewards, projections |
| `packages/content` | Track A | Loader, validation, guardrail lint (`src/guardrails.json` is editable by non-developers), pack builder, `lint:content` CLI |
| `packages/storygen` | Track A | LLM port and OpenRouter adapter (stubs; not used, see below) |
| `content/fixtures` | Track A | The small pack every test uses |
| `content/hyderabad` | Track A | The Hyderabad pack: 4 personas, 24 scenarios, 10 events, 20 quiz questions, 12 scam messages, English + Hindi |
| `packages/db` | Track B | Drizzle schema, migrations, test-database helper |
| `apps/api` | Track B | Fastify API, seed and retention scripts |

## Content

The Hyderabad pack was written **once by a model at authoring time** and committed as JSON. Nothing is generated at runtime. Every item is a draft until financial review, compliance review and a native Hindi check are done (see `content/hyderabad/README.md`). Telugu and Urdu need only `strings/te.json` and `strings/ur.json`: the API builds a pack for every language file it finds.

## API

All routes except `/health` are under `/v1`. Request and response bodies are the zod schemas in `@paisa/contracts`. The OpenAPI document is generated from them at `GET /v1/openapi.json`. Errors are always `{ "error": code, "message": text }`.

| Area | Routes | Auth |
| --- | --- | --- |
| Join | `POST /join`, `GET /me`, `PATCH /me` | none / student |
| Game | `POST /games`, `GET /games`, `GET /games/:id`, `POST /games/:id/actions` (`choose`, `rewind`, `advance`) | student |
| Sync | `POST /sync` (up to 500 events, idempotent on `eventId`) | student |
| Quizzes | `POST /quizzes/:kind/start`, `POST /quizzes/:attemptId/submit` | student |
| Content | `GET /content/manifest`, `GET /content/packs/:id` (ETag, immutable) | none |
| Tools | `POST /tools/projection` (Time Machine: bad / average / good, with assumptions) | none |
| Staff auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `GET /auth/me` | none / staff |
| NGOs | `GET/POST /orgs`, `GET/POST /centres`, `POST /staff` | staff (role-checked) |
| Classes | `GET/POST /classes`, `GET/PATCH /classes/:id`, `GET /classes/:id/progress` | facilitator, NGO admin |
| Reports | `GET /reports/learning-gains?classId=` or `?orgId=` | staff; Vanguard gets NGO aggregates with a minimum of 10 students per cell |

Students hold a device token per profile (an `anonId`, no personal data). Staff sign in with an emailed one-time code. Set `OTP_DEV_ECHO=true` locally to get the code in the response, because there is no real mailer yet.

## Not built yet

These are the remaining plan tasks. Each one is additive on top of what exists.

- **Row-level security (B2).** Access is enforced in the route layer and covered by isolation tests. Postgres RLS policies are still to come.
- **Content studio, review workflow and publishing (B13–B15), and the worker (B12).** Content is files in `content/`, validated and built when the API starts.
- **Classroom mode (B16), CSV and PDF exports, certificates and the join-sheet PDF (B17, B18).**
- **Real email sender, rate limits beyond OTP, and deploys (B20, B21).**
- **Balancing (A21).** A 4,800-game simulation of the Hyderabad pack shows no crashes and no running out of cards. But with the current numbers, the persona goals for Ravi, Sana and Kiran are out of reach in 12 months even with careful play, and Lakshmi often ends Level 2 in debt.
