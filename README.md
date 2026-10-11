# MoneyFollows

Setup and run instructions.

## Requirements

- Node.js 20.12 or newer
- pnpm 10 (`corepack enable` installs the version pinned in `package.json`)
- Docker, for the local backend and the SQL tests
- Google Chrome, for the browser tests (optional)

## Quick start (student app, no backend)

```bash
pnpm install
pnpm dev:student
```

Open http://localhost:5173. Without backend settings the app still runs: joining a class uses an offline stand-in and events stay queued on the device.

## Full local setup (student app, dashboard and backend)

```bash
pnpm install
cp .env.example .env
npx supabase start          # local Supabase (Postgres, Auth, API) on ports 54321/54322; prints the API URL and anon key
npx supabase db reset       # applies supabase/migrations and supabase/seed.sql
pnpm dev:student            # student app on http://localhost:5173
pnpm dev:dashboard          # staff dashboard on http://127.0.0.1:5174
```

Put the `API URL` and `anon key` that `supabase start` prints into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both apps read the root `.env`. Keep the dashboard on port 5174: it is the local auth site URL. Every variable is described in `.env.example`.

Local demo data:

- Class code: `HYD234`
- Facilitator sign-in: `demo.facilitator@example.org`, password `paisa-demo-2026` (local only; the dashboard's dev build also has a "Use the local demo facilitator" button)
- Password-reset emails need the `SMTP_*` values in `.env`.
- `pnpm seed` regenerates `supabase/seed.sql` and loads it into `SUPABASE_DB_URL`. It refuses a non-local database unless you pass `--allow-remote-demo`.

## Demo mode

- http://localhost:5173/?demo=1 plays a seeded demo save, kept apart from any real save. Add `&reset=1` to start it fresh.
- Hidden demo panel: on the main screen, triple-tap the "Month · Week · Day" chip (demo mode or a dev build).
- Other URL options for testing: `?lang=hi` (Hindi), `?seed=N` (fixed random seed), `?screen=<name>` (open a screen directly, e.g. `map`, `news`, `bank`).

## Build and preview

```bash
pnpm --filter student build                 # apps/student/dist
pnpm --filter student exec vite preview     # http://localhost:4173
pnpm --filter dashboard build               # apps/dashboard/dist
pnpm --filter dashboard preview             # http://localhost:5174
```

To try offline play (airplane mode), use the production build: the dev server has no service worker. Open the app once online, then go offline.

## Tests

```bash
pnpm check                  # typecheck, lint, all tests, content lint (run before every commit)
pnpm db:test:up             # optional: Postgres on port 54330 for the SQL tests (they skip without it; set PAISA_TEST_DB_PORT and SUPABASE_TEST_DB_URL if that port is taken)
pnpm lint:content -- --strict   # content lint for release builds (also fails on drafts)
```

Browser test of the classroom (Chrome, macOS or Linux; start `pnpm dev:student` first; `E2E_URL` and `CHROME_PATH` override the defaults):

```bash
pnpm --filter student e2e
```

## Hosted project

1. Create the Supabase project in region **ap-south-1 (South Asia, Mumbai)**. The region is fixed at creation. Check it under Project Settings → General, or with `npx supabase projects list`.
2. Run `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npx supabase db push` (migrations only; never load `seed.sql` into the hosted project).
3. Put the `SMTP_*` values and `DASHBOARD_URL` (the deployed dashboard, https, no trailing slash) in `.env`. Check `project_id` in the `[remotes.production]` block at the end of `supabase/config.toml`, then run `set -a && . ./.env && set +a && npx supabase config push`. If it warns that `DASHBOARD_URL` is unset, stop and set it first.
4. Add yourself as staff (see "Staff accounts"), then load the demo class: `SUPABASE_DB_URL=<hosted connection string> pnpm seed -- --hosted-demo you@team.org`. Re-running it replaces the demo class.

## Deploy (Vercel)

Create one Vercel project per app, both from this repository:

| Project   | Root Directory   | Environment variables                                                        |
| --------- | ---------------- | ---------------------------------------------------------------------------- |
| student   | `apps/student`   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SHOW_DRAFT_LANGS=false` |
| dashboard | `apps/dashboard` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STUDENT_URL`            |

`VITE_STUDENT_URL` is the deployed student app (https, no trailing slash). Each app's `vercel.json` sets the build. Keep "Include files outside the Root Directory" on (the default).

## Staff accounts

To let a facilitator create a dashboard account, run as the project owner:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role key> DASHBOARD_URL=https://<dashboard>.vercel.app \
  pnpm staff:invite -- name@ngo.org
```

The service role key is under Project Settings → API (locally, `npx supabase status`). Keep it in your shell for that one command, never in a `VITE_*` variable or in git. Locally, `SUPABASE_URL` can be left out. The person then opens the dashboard, taps **First time here? Create your account**, and picks a password.

Without the script, run `insert into public.staff (email) values ('name@ngo.org');` (lowercase) in the SQL editor.

## Commands

| Command                                   | What it does                                                      |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev:student` / `pnpm dev:dashboard` | Run the apps in development                                       |
| `pnpm check`                              | Typecheck, lint, all tests and content lint                       |
| `pnpm test`                               | Unit and SQL tests                                                |
| `pnpm lint:content`                       | Content linter                                                    |
| `pnpm seed`                               | Regenerate `supabase/seed.sql` and load it into `SUPABASE_DB_URL` |
| `pnpm staff:invite -- name@ngo.org`       | Add a facilitator to the staff list                               |
| `pnpm db:test:up`                         | Start the Postgres used by the SQL tests                          |
| `pnpm --filter student glossary`          | Optional authoring tool; needs `OPENROUTER_API_KEY` in `.env`     |

## Datasets and model weights

None. No externally hosted datasets or model weights are needed to build or run the apps; all content ships in this repository. The optional glossary authoring tool calls a hosted model through [OpenRouter](https://openrouter.ai) with your own API key; nothing is downloaded.

## Third-party assets

The pixel art is built from these CC0 packs (copies are in `apps/student/assets-src/`):

- [UI Pack - Pixel Adventure](https://kenney.nl/assets/ui-pack-pixel-adventure) by Kenney
- [RPG Urban Pack](https://kenney.nl/assets/rpg-urban-pack) by Kenney
- [Cool School tileset](https://opengameart.org/content/cool-school-tileset) by NettySvit

## License

MIT. See [LICENSE](LICENSE).
