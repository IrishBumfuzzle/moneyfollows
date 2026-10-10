# CLAUDE.md — Paisa Path (Vanguard India Financial Literacy Hackathon)

Read this file fully at the start of every session. It is the source of truth for scope, contracts, ownership and deadlines. If something here conflicts with a chat instruction, ask which one wins before proceeding.

## 0. How Claude should work in this repo

- **We are in a 20-hour hackathon. 
- **Plan briefly before any change touching more than ~3 files.** State the plan in 3–5 lines, then do it.
- **Contracts are frozen** (section 5). Never change types in `packages/shared` or the API shapes without telling the user, because it breaks other people's work. Additive changes are fine if announced.
- **Run `pnpm check` before every commit.** Fix failures; never skip or disable tests/lint to get green.
- **commits**, In commits don't write coauthored by claude. and for pushes related to specific tasks, do those in a different branch 
- **No scope creep.** If asked for something in the "Won't" list (section 2), say so once, name the cost, and ask for confirmation.
- **Never commit secrets.** Use `.env` (git-ignored) and keep `.env.example` current.


## 1. Project in one paragraph

**Paisa Path** is a mobile-first life-simulation game for Class 11–12 students from underserved communities in Hyderabad. A student picks a persona (e.g. Sana, who tutors to save for college fees), runs that character's money month by month, makes weekly decisions, sees consequences in a safe sandbox (fictional money, rewind allowed) and learns four pillars: **Plan & budget, Save & manage, Understand investing, Stay financially safe.** It is offline-first (PWA), privacy-conscious (nickname + class code only), delivered through partner NGOs, and built to scale to ~1,500 students first, then new cities and languages.

Full product spec: `docs/spec.md` (paste the team's spec there). This file summarizes what we build *this weekend*.

### 1.1 App and game structure

- The app has several **sections**; the **game** is one of them. The other sections are not decided yet.
- Entering the game takes the player to a **map** with places: **Home, Shop, School, Hospital** (more may be added).
- A place can open a **sub-map** with its own locations, and the player plays inside those locations.
- Still to decide: what the other app sections are, and how the map's places connect to the weekly decision loop and the mini-games (section 2).

## 2. Scope for the hackathon (MoSCoW)

### Must (the demo path depends on these)
- Student PWA: language pick (**English + Hindi**), join class with code, nickname, persona pick (**2 personas: Sana, Ravi**), 3-card how-to-play.
- Game loop: weekly decision card → consequence sheet (jar changes + lesson card) → **rewind** → month-end report with **Money Health Score**. Play **3 in-game months** (12 weeks).
- Engine: pure TypeScript, deterministic (seeded), delayed consequences, surprise events.
- Content: **24 scenario cards (6 per pillar)**, fully in **en + hi**, plus 6 baseline/end-line quiz questions.
- Mini-games: **Scam or Safe?** (swipe messages) and **Time Machine** (compounding slider with `AssumptionBanner`).
- Offline play with queued sync (airplane-mode demo).
- Staff dashboard: create class + code/QR, student progress table, baseline vs end-line chart.
- Guardrail linter on content (section 7).
- Deployed live URL, seeded **demo mode**, README, fallback video.

### Should
- Voice-over via browser `speechSynthesis` (hi-IN / en-IN), hide the button if no voice is available.
- XP, 3–5 badges, weekly streak.
- Jar Splitter mini-game (budget).
- Simple "profile switcher" for shared phones (no PIN).

### Could
- Life Happens deck, Basket Builder, classroom live-vote mode, announcements, certificate PDF.
- Telugu **draft** toggle (see section 7.4).

### Won't (show on the roadmap slide, do not build)
Urdu/RTL, Telugu as a shipped language, recorded voice-over packs, headless CMS, translation platform (Weblate/Crowdin), self-hosted analytics, Play Store wrapper, picture-PIN, retention check, full 4 personas × 12 months, Levels 3.

## 3. Team, lanes and ownership

Assign names at kickoff. Four people:

| Lane | Owner | Owns (may edit) | Does NOT edit |
|---|---|---|---|
| **UI-1** | Student app lead (+ pitch/PPT) | `apps/student/**`, `docs/pitch/**` | `packages/engine`, `supabase/**` |
| **UI-2** | Dashboard + mini-games | `apps/dashboard/**`, `apps/student/src/games/**` | `packages/engine`, `supabase/**` |
| **BE-1** | Engine + content | `packages/engine/**`, `packages/content/**`, `scripts/**` | `apps/**` |
| **BE-2** | API, DB, sync, deploy, integrator | `supabase/**`, `packages/api-client/**`, `.github/**`, deployment config | `packages/engine`, `packages/content` |

`packages/shared/**` is **shared and frozen** (section 5): changes need a heads-up in the team channel.

BE-2 is also the **integrator**: owns "does it run end-to-end, deployed, right now?", merges, submissions and the deadline clock.

## 4. Stack and repo layout

- **Monorepo:** pnpm workspaces, Node 20+, TypeScript `strict`, Vitest, ESLint, Prettier, zod.
- **Student app:** Vite + React + TypeScript PWA (`vite-plugin-pwa`), Zustand for UI state, `idb-keyval` for IndexedDB saves and the sync queue, `react-i18next` for strings. Canvas/CSS for mini-games. Mobile-first at 360 px.
- **Dashboard:** Vite + React + TypeScript, shares `packages/shared` types, a small chart lib (Recharts).
- **Engine:** `packages/engine` — pure TS, **no DOM, no network, no `Date.now()` or `Math.random()`**. State in → state out.
- **Backend:** Supabase (Postgres + row-level security + auth for staff + SQL functions), region **ap-south-1 (Mumbai)**. Students never create accounts.
- **Hosting:** Vercel (apps), Supabase (backend). Content packs are static JSON bundled with the app for the hackathon.

```
/apps/student        # PWA (UI-1)
/apps/dashboard      # staff web app (UI-2)
/packages/shared     # types, zod schemas, constants  (FROZEN contracts)
/packages/engine     # simulation (BE-1)
/packages/content    # scenarios, quizzes, i18n, guardrails (BE-1)
/packages/api-client # typed client for the backend (BE-2)
/supabase            # migrations, RLS, seed.sql (BE-2)
/scripts             # content generation + guardrail-lint + seed (BE-1)
/docs                # spec.md, decisions.md, pitch/
```

Commands (keep these working):

```
pnpm install
pnpm dev:student     # student app
pnpm dev:dashboard   # dashboard
pnpm test            # vitest across packages
pnpm lint:content    # guardrail linter
pnpm check           # typecheck + lint + test + lint:content  (must pass before commit)
pnpm seed            # load demo class, students, events
```

## 5. Contracts (frozen at v0 — announce any change)

### 5.1 Core types (`packages/shared/src/types.ts`)

```ts
export type Lang = 'en' | 'hi' | 'te' | 'ur';
export type PersonaId = 'ravi' | 'sana' | 'kiran' | 'lakshmi';
export type Pillar = 'plan_budget' | 'save_manage' | 'understand_investing' | 'stay_safe';
export type Level = 'starter' | 'explorer' | 'planner';
export type JarId = 'needs' | 'wants' | 'goals' | 'savings';
export type TKey = `t:${string}`;               // translation key, resolved in the UI

// Money is whole rupees (integers). Never use floats for money.
export interface Effects {
  jars?: Partial<Record<JarId, number>>;        // + adds, − spends
  debt?: number;                                 // + borrows, − repays
  flags?: string[];                              // set story flags
}

export interface DelayedEffect { afterWeeks: number; effects: Effects; note: TKey }

export interface Choice {
  id: string;
  label: TKey;
  icon?: string;
  effects: Effects;
  delayed?: DelayedEffect[];
  lesson: TKey;                                  // one sentence + "what this means"
}

export interface Scenario {
  id: string;                                    // e.g. "budget.recharge.01"
  pillar: Pillar;
  concept: string;
  personas: PersonaId[];
  difficulty: 1 | 2 | 3;
  text: TKey;
  illustration?: string;
  requiresFlag?: string;
  assumption?: boolean;                          // true => must render AssumptionBanner
  choices: Choice[];                             // 2–4
  meta: { status: 'draft' | 'reviewed'; author: string };
}

export interface GameState {
  version: 1;
  personaId: PersonaId;
  level: Level;
  seed: number;
  month: number;                                 // 1-based
  week: number;                                  // 1–4
  jars: Record<JarId, number>;
  debt: number;
  goal: { amount: number; progress: number };
  flags: string[];
  seen: string[];                                // scenario ids
  pending: { dueMonth: number; dueWeek: number; effects: Effects; note: TKey }[];
  rewindTokens: number;
  history: unknown[];                            // snapshots for rewind (engine-internal)
  score?: number;                                // Money Health Score, set at month end
}
```

### 5.2 Engine API (`packages/engine`)

```ts
createGame(personaId, level, seed): GameState
nextCard(state, content): Card                   // 'decision' | 'event' | 'monthEnd' | 'yearEnd'
choose(state, content, choiceId): { state: GameState; consequence: Consequence }
rewind(state): GameState | null                  // null if no tokens/snapshot
monthReport(state): { score: number; parts: ScoreParts; reflection: TKey }
projectGrowth(monthlyAmount, years, rates): { low: number[]; avg: number[]; high: number[] }
```

Rules the engine must satisfy (each has a unit test):
1. **Deterministic:** same `(persona, level, seed, choices)` → identical state.
2. **Immutable:** functions never mutate their input.
3. **Jars cannot go negative.** A spend beyond the balance must borrow (adds `debt`) or be blocked.
4. **Rewind** restores the exact prior state and consumes one token (3 per month).
5. **Delayed effects** fire on the right week, even across a month boundary.
6. **Serializable:** `JSON.parse(JSON.stringify(state))` round-trips.

### 5.3 Money Health Score (v0, tunable)

All terms are clipped to $[0,1]$: $s$ = savings rate against a 20% target, $e$ = savings jar divided by one month of Needs, $g$ = goal progress, $d$ = debt divided by monthly income.

$$\text{MHS} = 100\left(0.30\,s + 0.30\,e + 0.25\,g + 0.15\,(1-d)\right)$$

### 5.4 Growth projection (Time Machine)

For monthly amount $P$, assumed annual rate $r$, $i = r/12$ and $n = 12t$ months:

$$FV = P \cdot \frac{(1+i)^{n} - 1}{i} \qquad (i > 0), \qquad FV = P\,n \quad (i = 0)$$

Assumed rates for the game: low 4%, average 8%, high 12% **(placeholders, confirm with Vanguard compliance)**. Always show all three as a range, never one number, and always show `AssumptionBanner`.

### 5.5 Backend API (Supabase SQL functions, called via `packages/api-client`)

| Function | Input | Output | Notes |
|---|---|---|---|
| `join_class(class_code, nickname)` | text, text | `{anon_id, class_id, default_lang}` | creates anonymous profile; nickname passes word filter |
| `push_events(events[])` | `SyncEvent[]` | `{accepted:number}` | **idempotent** on `event_id` |
| `class_progress(class_id)` | uuid | rows per student: modules done, last_active | facilitator only (RLS) |
| `learning_gain(class_id)` | uuid | baseline vs end-line averages by pillar | facilitator only |

```ts
export interface SyncEvent {
  event_id: string;            // uuid, generated on device
  anon_id: string;
  class_id: string;
  type: 'app_open' | 'onboarding_complete' | 'persona_selected' | 'decision_made'
      | 'rewind_used' | 'event_triggered' | 'minigame_complete' | 'quiz_submitted'
      | 'module_complete' | 'badge_earned' | 'language_changed' | 'sync_complete'
      | 'map_opened' | 'location_selected';
  payload: Record<string, unknown>;
  client_ts: string;           // ISO
  content_version: string;
}
```

Map signals (added 2026-10-10, additive; emitted by the student app's `LocationScreen`, `apps/student/src/screens/LocationScreen.tsx`):

| `type` | When | `payload` |
|---|---|---|
| `map_opened` | The overworld map screen is shown | `{}` |
| `location_selected` | The student taps a building (`onSelect(id)`) | `{ location_id: LocationId }` |

```ts
// ids are stable keys, not labels (the "Shop" place is `convenience`); labels are localised separately
export type LocationId = 'school' | 'hospital' | 'convenience' | 'home';
```

Both are fire-and-forget like all `SyncEvent`s: queued offline, pushed via `push_events`, idempotent on `event_id`. `location_selected` fires on tap, before any sub-map or scenario opens. Sub-map locations, once decided, will reuse `location_selected` with a new `LocationId` value (additive).

### 5.6 Database (MVP tables)

`classes(id, class_code, default_lang, facilitator_id, name)` · `students(anon_id, class_id, nickname, lang, level, created_at)` · `events(event_id pk, anon_id, class_id, type, payload, client_ts)` · `quiz_attempts(id, anon_id, quiz_type, answers, score, created_at)`.

No real names, phone numbers, birth dates, addresses or bank data. Facilitators see only their own classes (RLS). Vanguard sees aggregates only.

### 5.7 Content and i18n

- Content lives in `packages/content/`: `scenarios/*.json`, `quizzes/*.json`, `personas.json`, `i18n/{en,hi,te}.json`, `guardrails.json`.
- Every user-facing string is a `t:` key in the i18n files. **No hard-coded words in components or images.**
- Keys follow the scenario id: `budget.recharge.01.story`, `budget.recharge.01.a.label`, `lesson.needs_first`.
- Amounts display with Indian grouping: `new Intl.NumberFormat('en-IN')` → ₹1,00,000, in every language.

## 6. UI standards (UI-1 and UI-2)

- **Mobile-first, 360 px wide**, tested on Chrome DevTools "Slow 4G" with CPU 4× slowdown. Initial JS budget: aim under ~250 KB gzipped.
- Font ≥ 16 px (Noto Sans); tap targets ≥ 48 px; 8 px grid; 12 px rounded cards.
- **Jar colours** (always with icon + label, never colour alone): Needs teal, Wants amber, Goals purple, Savings green.
- Every choice has an **icon + short label**. Jargon always followed by a one-line "what this means".
- Respect `prefers-reduced-motion`; provide a **data-saver** toggle that disables animation.
- Show **offline / sync status as a banner**, not as a separate screen.
- No timers by default (anxiety).
- Student app screens to build first: Language → Join class → Nickname/avatar → Persona → My Month → Decision → Consequence → Month-end report. Then: Scam or Safe?, Time Machine, Me (badges), Settings.
- Dashboard screens: Sign in → Class setup (code + QR) → Class progress table → Learning gains chart.
- Component names to reuse from the spec: `WalletCard`, `JarCard`, `JarDelta`, `DecisionCard`, `ChoiceButton`, `ConsequenceSheet`, `LessonCard`, `ScoreRing`, `SwipeCard`, `MessageInspector`, `TimeSlider`, `GrowthChart`, `AssumptionBanner`, `OfflineBanner`.
- The UI talks to the engine **only through the engine API** (5.2) and to the backend **only through `api-client`**. Develop against the mock engine (`packages/engine/src/mock.ts`) until the real one lands.

## 7. Content, AI usage and guardrails

### 7.1 Where Claude is used (and where it is not)

- **Authoring time (yes):** Claude drafts scenarios, quiz questions, lesson cards and Hindi translations as JSON matching the `Scenario` schema. Output is validated by zod and the guardrail linter, then **a human reviews it and flips `status` to `reviewed`**.
- **Runtime in the student app (no):** no live LLM calls. Reasons: works offline, no child data sent anywhere, fully predictable, nothing to go wrong on stage. This is a deliberate safety and scale decision; say so in the pitch.
- Optional stretch (only before freeze): a facilitator-side "summarize where my class is struggling" using aggregated, anonymized counts, with the API key held server-side only.

### 7.2 Guardrail rules (enforced by `pnpm lint:content`)

1. Schema valid (zod); 2–4 choices; ids unique.
2. Every `t:` key exists in **en and hi**. Missing Hindi = build failure.
3. **Educate, never recommend.** No imperative investment advice ("you should invest/buy…"), no guarantees ("guaranteed", "sure returns", "risk-free"), no real banks, funds, stocks, apps or schemes named as something to choose. Forbidden-term list lives in `packages/content/guardrails.json` and is reviewable by non-developers.
4. Investing content only uses **fictional assets**: "Steady Deposit", "Mixed Basket", "Rocket Co".
5. Any scenario with `assumption: true` or in `understand_investing` must render `AssumptionBanner`. Projections come only from `projectGrowth` (always a range).
6. Safe outbound links only: the 1930 cyber crime helpline and cybercrime.gov.in.
7. Tone: no shaming of poverty or family situations; no preaching; reading level about Class 8; text length caps per field (story ≤ 220 chars, choice label ≤ 40, lesson ≤ 140).
8. `--strict` mode (used for release builds) also fails on any `status: draft`.

### 7.3 Hindi rules

- Keep common terms students hear in English (UPI, OTP, EMI, KYC) and add a short Hindi explanation.
- Use one consistent glossary: `packages/content/glossary.hi.json` (e.g. emergency fund → आपातकालीन बचत). Reuse it in every prompt that generates Hindi.
- A Hindi-speaking teammate spot-checks at least the 10 most-used cards before the demo.

### 7.4 Telugu

Nobody on the team speaks Telugu. Telugu is **not** a shipped language. If generated, it lives in `i18n/te.json` with `"_meta": {"status": "machine_draft"}`, is behind `VITE_SHOW_DRAFT_LANGS=true`, and is labelled "Draft — pending native review" in the UI. The pitch line: *Hindi/English today; Telugu next, verified by the NGO partner's native speakers before any student sees it.* Adding a language must require **only a new i18n file, no code change**; prove this live if asked.

### 7.5 Privacy rules (non-negotiable)

- Collect only: nickname + class code + anonymous id. Nicknames pass a word filter.
- No student-to-student chat or user-written text visible to others.
- No ads, no third-party trackers, no selling or sharing data.
- Store data in an India region (ap-south-1).
- Open question for Vanguard legal (not for us to decide): India's DPDP Act, 2023 on verifiable parental consent for under-18s and limits on behavioural monitoring of children. Mention it as a rollout dependency; do not claim compliance.

## 8. Deadlines (IST) and checkpoints

| When | Deadline | Our internal target |
|---|---|---|
| Sat 10 Oct, 22:00 | **M1 (Approach PDF)** | Submit by **21:30** |
| Sun 11 Oct, 04:00 | **M2 (Progress PDF + code push)** | Submit by **03:30** |
| Sun 11 Oct, 08:30 | — | **Feature freeze** |
| Sun 11 Oct, 11:00 | **Final submission (hard):** code, README, LICENSE, zip, report, video | Submit by **10:30** |
| Sun 11 Oct, 11:30 | **Slides submission** | Slides finished by 10:00, submit by 11:15 |
| Sun 11 Oct, 13:30–17:00 | R1 internal presentations | Take notes on every piece of judge feedback |
| Sun 11 Oct, 17:30 on | R2 final + closing | Fix the pitch only, no code changes |

**What each submission requires (from the organizers)**

- **M1, Approach (10 Oct, 22:00):** a PDF, **max 2 pages**, with the high-level idea, abstract, approach and/or proposed architecture (a high-level pipeline is enough, no exact details), plus a rough testing plan outlining the testing methods we intend to use.
- **M2, Mid-submission (11 Oct, 04:00):** (i) a progress report PDF, **max 2 pages**: approach, experiments run so far, progress on testing; (ii) a **code push** with all scripts built so far.
- **Final submission (11 Oct, 11:00):**
  - Full solution code in the repository, with a `README.md` holding **build and run instructions only** (do not explain the solution or approach in it) and a `LICENSE` file (per Section 11 of the brief).
  - A **zip archive** of the code, uploaded through the submission form as a backup.
  - A **final report PDF, max 3 pages**: the solution, approach, features, etc.
  - A **demo video, max 4 minutes**: a recording of the solution with a voiceover explaining it.
- **Slides (11 Oct, 11:30):** the presentation slides.

**Definition of done per checkpoint**

- **M1:** the approach PDF is submitted. Build target for the same time (live URL, even if rough): language (en/hi) → join class → nickname → persona → weekly decisions → consequence + lesson → rewind → month-end score. Engine tests green. Deployed.
- **M2:** the progress PDF is submitted and all code is pushed. Build target: + Scam or Safe?, Time Machine with `AssumptionBanner`, offline play with queued sync, dashboard class progress, Hindi complete for all 24 cards, guardrail linter in CI.
- **Freeze (08:30):** + baseline/end-line quiz and learning-gain chart, demo mode, voice-over if time allows. After this: bugs, copy, polish only. Start the final report and record the demo video now.
- **Final submit (10:30):** clean `main`, README (build/run steps only), `LICENSE`, `.env.example`, no secrets, deployed link works on a phone, zip uploaded, final report PDF (≤ 3 pages), demo video (≤ 4 min, voiceover).

Sleep in staggered shifts (min. 3 hours each), roughly Sun 01:00–04:00 and 04:00–08:00. Tired teams ship bugs.

## 9. Demo script (3 minutes) and fallbacks

1. **Hook (15 s):** the problem and who it is for (Class 11–12, underserved Hyderabad).
2. **Onboarding (30 s):** pick Hindi, enter class code, nickname, persona Sana.
3. **Core loop (60 s):** one weekly decision → consequence → **rewind** → lesson card. Show a delayed consequence landing.
4. **Safety (30 s):** Scam or Safe? with Message Inspector.
5. **Investing (20 s):** Time Machine slider; point at the AssumptionBanner and the low/avg/high range.
6. **Offline (10 s):** switch on airplane mode, keep playing, reconnect, show sync.
7. **NGO view (20 s):** dashboard with class progress and the baseline vs end-line chart (labelled demo data).
8. **Close (15 s):** scale story and the rubric map slide.

**Demo mode:** `?demo=1` loads a seeded save (fixed seed, mid-year state) so the demo never depends on luck or a long play-through.
**Fallbacks:** the submitted demo video (≤ 4 min, with voiceover, due at the 11:00 final submission), a seeded database, and a local build on a laptop.

## 10. Pitch slides (5) and the rubric map

1. Problem and audience. 2. The experience (clip or live). 3. **Rubric map:** each success measure → the feature that delivers it. 4. Scale: 1,500 students first, cost per student, how an NGO onboards a school, language roadmap. 5. Guardrails and privacy.

| Brief measure | What we show |
|---|---|
| Simple | Starter level, "what this means" lines, 2–4 icon choices |
| Relatable | Hyderabad scenarios (bus pass, Bonalu/Eid/Diwali, recharge), persona backstories |
| Persona-led | Sana vs Ravi get different income, goals and events |
| Language-ready | Live en/hi switch, string-file architecture, new language = one file |
| Game-based | Simulation loop, mini-games, baseline vs end-line quiz |
| Intuitive UI | Four-tab nav, large icon choices, first decision in under 3 minutes |
| NGO-integrated | Class code/QR, progress table, learning-gain view |
| Guardrail | AssumptionBanner, fictional assets, content linter, "educate, don't recommend" |

Note: the brief's heading says "six measures" but lists seven. We cover all seven; ask the organizers which are scored.

## 11. Testing and pre-submission checklist

- Engine unit tests: determinism, immutability, jars ≥ 0, rewind, delayed effects, serialization.
- `pnpm lint:content` passes in `--strict` before the code submission.
- Manual smoke on a real Android phone: install the PWA, play offline, reconnect, sync.
- Run the new-user path from scratch with someone who has never seen the app; time to first decision under 3 minutes.
- Final check: a fresh clone → `pnpm install && pnpm dev:student` works from the README alone.
- `README.md` contains only build and run instructions; `LICENSE` exists at the repo root; the zip archive matches the pushed code.

## 12. Decisions log and open questions

Append decisions here as `YYYY-MM-DD HH:MM — decision — who`.

- 2026-10-10 — Languages: en + hi shipped; Telugu draft-only; Urdu out of scope — team.
- 2026-10-10 — No runtime LLM in the student app; AI used at authoring time with human review — team.

Open questions:
- Which license does Section 11 of the brief require for the `LICENSE` file?
- What are the app's other sections, and how do the game map's places (Home, Shop, School, Hospital) and sub-maps connect to the weekly decision loop and mini-games?
- Which success measures are scored: six or seven?
- Compliance-approved assumed growth rates for Time Machine (placeholders: 4/8/12%).
- Who is the native Telugu reviewer, if any, via the NGO partner?