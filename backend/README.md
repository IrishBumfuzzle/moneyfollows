# Paisa Path backend

The game engine, content pipeline, story generation, API and database for Paisa Path, in one TypeScript workspace.

**Read first:** [Backend Design & Parallel Plan](../docs/Paisa%20Path%20—%20Backend%20Design%20%26%20Parallel%20Plan.md). It covers the plan, the two-track split, seams, rules and task IDs.

## Setup

Requires Node 22.12+ and Docker.

```bash
cp .env.example .env
npm install
npm run db:up
npm run check
npm run dev          # http://localhost:3000/health
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run check` | Boundary rules + typecheck + all tests (what CI runs) |
| `npm test` | All tests (`npx vitest run packages/engine` for one package) |
| `npm run typecheck` | `tsc` in every workspace |
| `npm run check:boundaries` | Import direction, deep imports, engine/contracts purity |
| `npm run dev` / `npm start` | API with / without reload |
| `npm run db:up` / `npm run db:down` | Local Postgres 17 |
| `npm run db:generate` / `npm run db:migrate` | Create / apply Drizzle migrations |

## Layout

| Path | Owner | Contents |
| --- | --- | --- |
| `packages/contracts` | shared | zod schemas and types shared by every package |
| `packages/engine` | Track A | Pure, seeded game simulation |
| `packages/content` | Track A | Validation, guardrail lint, pack builder |
| `packages/storygen` | Track A | LLM port, OpenRouter adapter, scenario and translation drafts |
| `content/` | Track A | Fixtures, seed content, persona and region bibles |
| `packages/db` | Track B | Drizzle schema, migrations, RLS |
| `apps/api` | Track B | Fastify API |
