# CLAUDE.md — MoneyFollows (Vanguard India Financial Literacy Hackathon)

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

**MoneyFollows** is a mobile-first life-simulation game for Class 11–12 students from underserved communities in Hyderabad. A student picks a persona (e.g. Sana, who tutors to save for college fees), runs that character's money month by month, makes weekly decisions, sees consequences in a safe sandbox (fictional money, rewind allowed) and learns four pillars: **Plan & budget, Save & manage, Understand investing, Stay financially safe.** It is offline-first (PWA), privacy-conscious (nickname + class code only), delivered through partner NGOs, and built to scale to ~1,500 students first, then new cities and languages.

Full product spec: `docs/spec.md` (paste the team's spec there). Visual rules: `DESIGN.md`. This file summarizes what we build *this weekend*.

### 1.1 App and game structure

- **Hub:** the app opens on a **main screen**: the player's character sits on a couch at the top, a big **Play** button opens the **Map** (the game), and a **news rack** opens **Paisa Times**. This replaces the earlier room with a door, newspaper, trophy shelf and notebook. Where **Me** (badges, XP) and **Notes** (lesson cards + Word Wallet) go is open; the simplest answer is two small icon buttons on the main screen.
- **Game map:** a tall, vertically scrolling illustrated Hyderabad neighbourhood with places: **Home, Shop (`convenience`), School, Hospital, Bank**. The Shop opens a **sub-map** (phone shop, kirana, clothes stall). The player plays inside places and sub-map locations.
- **Weekly loop on the map:** each week the engine pins 2–4 places that hold this week's decisions; going Home to **sleep** ends the week (rules in 5.8).
- **Inside a place:** in-person events play as a **dialogue scene**; remote events (family texts, scams) arrive as **phone notifications** that open a chat.
- **Paisa Times:** a weekly newspaper of 5 short, original explainers. Highlighted words open a thought-cloud popup with a simple meaning. One question per article; answering pays the character's **paper-route wage** in the game, once per edition (rules in 5.8).

## 2. Scope for the hackathon (MoSCoW)

### Must (the demo path depends on these)
- Onboarding: language (**English + Hindi**), join class with code, nickname + avatar, persona (**2 personas: Sana, Ravi**), 3-card how-to-play.
- **Hub** (room with tappable objects + tab bar).
- **Map** with 5 places and weekly pins; **Shop sub-map** with 3 locations; sleep at Home ends the week.
- Decisions: **dialogue scene** (in person) and **phone chat** (remote) → consequence sheet (jar changes + lesson card) → **rewind**. Delayed consequences shown as flashbacks. Surprise scam notifications.
- Home: payday jar split, sleep, **Month Recap** with **Money Health Score**. Play **3 in-game months** (12 weeks).
- Engine: pure TypeScript, deterministic (seeded), location-aware, delayed consequences, surprise events.
- Content: **24 scenario cards (6 per pillar)** tagged with a location; **1 Paisa Times edition (5 articles) + glossary**; 6 baseline/end-line quiz questions. All in **en + hi**.
- **Paisa Times:** edition front page, articles with thought-cloud word popups, 1 question each, paper-route wage, Word Wallet.
- Mini-games: **Scam or Safe?** with Message Inspector (Shop / phone scams) and **Time Machine** (Bank, with `AssumptionBanner`).
- Offline play with queued sync (airplane-mode demo).
- Staff dashboard: create class + code/QR, student progress table, baseline vs end-line chart.
- Guardrail linter on content (section 7).
- Deployed live URL, seeded **demo mode** + hidden demo panel, README, fallback video.

### Should
- Voice-over via browser `speechSynthesis` (hi-IN / en-IN), hide the button if no voice is available.
- XP, 3–5 badges, weekly streak.
- Jar Splitter mini-game (budget).
- Simple "profile switcher" for shared phones (no PIN).
- A sixth place: Workplace (Ravi's tiffin stall, Sana's tuition class).

### Could
- Life Happens deck, Basket Builder, classroom live-vote mode, announcements, certificate PDF.
- Telugu **draft** toggle (see section 7.4).
- More app sections beyond Map, Paisa Times, Me and Notes.

### Won't (show on the roadmap slide, do not build)
Urdu/RTL, Telugu as a shipped language, recorded voice-over packs, headless CMS, translation platform (Weblate/Crowdin), self-hosted analytics, Play Store wrapper, picture-PIN, retention check, full 4 personas × 12 months, Levels 3, live or scraped real news feeds, free-roam map without weekly pins.

## 3. Team, lanes and ownership

Assign names at kickoff. Four people:

| Lane | Owner | Owns (may edit) | Does NOT edit |
|---|---|---|---|
| **UI-1** | Map, places, decisions, phone and scams, Home (sleep, Month Recap), the School classroom quiz, the life meters (+ slides, report, video script) | `apps/student/**` except the UI-2 folders; owns the Kenney UI kit `apps/student/src/design/**`, `DESIGN.md`, `docs/pitch/**` | `packages/engine`, `supabase/**` |
| **UI-2** | Onboarding, main screen, Paisa Times, staff dashboard | `apps/student/src/features/onboarding/**`, `apps/student/src/features/main/**`, `apps/student/src/features/news/**`, `apps/dashboard/**` | `apps/student/src/design/**` (request changes from UI-1), `packages/engine`, `supabase/**` |
| **BE-1** | Engine + content | `packages/engine/**`, `packages/content/**`, `scripts/**` | `apps/**` |
| **BE-2** | API, DB, sync, deploy, integrator | `supabase/**`, `packages/api-client/**`, `.github/**`, deployment config | `packages/engine`, `packages/content` |

`packages/shared/**` is **shared and frozen** (section 5): changes need a heads-up in the team channel.

`apps/student/src/App.tsx` (navigation) and `apps/student/src/game/**` (the shared game store) are **shared by UI-1 and UI-2**: either may add a screen or a store action; tell the other each time. MessageInspector, Scam or Safe?, Time Machine, Me and Notes have **no owner yet**.

BE-2 is also the **integrator**: owns "does it run end-to-end, deployed, right now?", merges, submissions (M1, M2, final, zip) and the deadline clock.

## 4. Stack and repo layout

- **Monorepo:** pnpm workspaces, Node 20+, TypeScript `strict`, Vitest, ESLint, Prettier, zod.
- **Student app:** Vite + React + TypeScript PWA (`vite-plugin-pwa`), Zustand for UI state, `idb-keyval` for IndexedDB saves and the sync queue, `react-i18next` for strings, `motion` for animation, `@floating-ui/react` for popups. Canvas/CSS/SVG for the map and mini-games. Mobile-first at 360 px.
- **Dashboard:** Vite + React + TypeScript, shares `packages/shared` types, a small chart lib (Recharts).
- **Engine:** `packages/engine` — pure TS, **no DOM, no network, no `Date.now()` or `Math.random()`**. State in → state out.
- **Backend:** Supabase (Postgres + row-level security + auth for staff + SQL functions), region **ap-south-1 (Mumbai)**. Students never create accounts.
- **Hosting:** Vercel (apps), Supabase (backend). Content packs (scenarios, newspaper editions, glossary) are static JSON bundled with the app for the hackathon, so everything works offline.

```
/apps/student        # PWA (UI-1; news + games folders are UI-2)
/apps/dashboard      # staff web app (UI-2)
/packages/shared     # types, zod schemas, constants  (FROZEN contracts)
/packages/engine     # simulation (BE-1)
/packages/content    # scenarios, news, glossary, quizzes, i18n, guardrails (BE-1)
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

// Map places. Ids are stable keys, not labels (the "Shop" place is `convenience`);
// labels are localised separately. Sub-map locations are strings like "convenience.phone_shop".
export type LocationId = 'home' | 'convenience' | 'school' | 'hospital' | 'bank';

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
  location: LocationId;                          // where the pin appears on the map
  sublocation?: string;                          // e.g. "convenience.phone_shop"
  channel: 'in_person' | 'phone';                // dialogue scene vs phone chat
  speaker: TKey;                                 // who is talking (Ammi, shopkeeper, Unknown number)
  personas: PersonaId[];
  difficulty: 1 | 2 | 3;
  text: TKey;
  illustration?: string;
  requiresFlag?: string;
  assumption?: boolean;                          // true => must render AssumptionBanner
  choices: Choice[];                             // 2–4
  meta: { status: 'draft' | 'reviewed'; author: string };
}

// Paisa Times
export interface GlossaryTerm { id: string; word: TKey; simple: TKey; example: TKey }

export interface Article {
  id: string;
  edition: string;                               // e.g. "2026-W41"
  headline: TKey;
  body: TKey;                                    // contains [[termId]] markers
  terms: string[];                               // GlossaryTerm ids
  question: { prompt: TKey; options: TKey[]; correct: number; explanation: TKey };
  reward: { wage: number; xp: number };          // wage = in-game rupees for the paper-route shift
  meta: { status: 'draft' | 'reviewed'; author: string; factsCheckedBy?: string };
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
  earned: string[];                              // sourceIds already paid by earn()
  score?: number;                                // Money Health Score, set at month end
}
```

### 5.2 Engine API (`packages/engine`)

```ts
createGame(personaId, level, seed): GameState
pinsForWeek(state, content): { location: LocationId; sublocation?: string; scenarioId: string }[]
playAt(state, content, location, sublocation?): Card | null   // the pinned card at that place, if any
sleep(state, content): GameState                 // ends the week; blocked while pins remain; may trigger payday or monthEnd
earn(state, amount, sourceId): GameState         // e.g. paper-route wage; idempotent per sourceId
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
7. **`earn` is idempotent:** the same `sourceId` never pays twice.
8. **`sleep` is blocked** while any of the week's pins are unplayed.

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
      | 'map_opened' | 'location_selected'
      | 'week_slept' | 'glossary_term_opened' | 'news_question_answered' | 'news_edition_completed';
  payload: Record<string, unknown>;
  client_ts: string;           // ISO
  content_version: string;
}
```

Map and news signals (additive; fire-and-forget like all `SyncEvent`s: queued offline, pushed via `push_events`, idempotent on `event_id`):

| `type` | When | `payload` |
|---|---|---|
| `map_opened` | The map screen is shown (emitted by `apps/student/src/screens/LocationScreen.tsx`) | `{}` |
| `location_selected` | The student taps a place (`onSelect(id)`), before any sub-map or scenario opens | `{ location_id: LocationId \| string }` (sub-map locations use their string id) |
| `week_slept` | The student sleeps at Home and the week advances | `{ month, week }` |
| `glossary_term_opened` | A thought-cloud popup opens | `{ term_id, article_id }` |
| `news_question_answered` | An article question is answered | `{ edition, article_id, correct, attempt }` |
| `news_edition_completed` | All 5 articles answered | `{ edition, correct_count }` |

### 5.6 Database (MVP tables)

`classes(id, class_code, default_lang, facilitator_id, name)` · `students(anon_id, class_id, nickname, lang, level, created_at)` · `events(event_id pk, anon_id, class_id, type, payload, client_ts)` · `quiz_attempts(id, anon_id, quiz_type, answers, score, created_at)`.

No real names, phone numbers, birth dates, addresses or bank data. Facilitators see only their own classes (RLS). Vanguard sees aggregates only.

### 5.7 Content and i18n

- Content lives in `packages/content/`: `scenarios/*.json`, `news/<edition>.json`, `glossary.json`, `quizzes/*.json`, `personas.json`, `places.json`, `i18n/{en,hi,te}.json`, `guardrails.json`.
- Every user-facing string is a `t:` key in the i18n files. **No hard-coded words in components or images.**
- Keys follow the item id: `budget.recharge.01.story`, `budget.recharge.01.a.label`, `lesson.needs_first`, `news.2026-W41.upi_fraud.headline`, `glossary.inflation.simple`.
- Amounts display with Indian grouping: `new Intl.NumberFormat('en-IN')` → ₹1,00,000, in every language.

### 5.8 Map, week and Paisa Times rules

**Map and week loop**
- Places and sub-map locations are data (`places.json` + `apps/student/src/features/map/places.ts`): id, name key, map position, illustration, children, unlock rule. Adding a place must not need new screen code.
- Each week the engine pins 2–4 places. Pinned places hold this week's decisions; unpinned places offer practice (mini-games, replays) with no effect on the story.
- Sleeping at Home ends the week and is blocked while pins remain (show a friendly "still to do" sheet with the pins highlighted). Payday and the Month Recap happen at Home.
- Scam notifications can arrive anywhere, but never interrupt a scene in progress; they queue until it ends.
- First-time players see a guide arrow to the first pin. Target: first decision in under 3 minutes from app open.
- Place ↔ pillar mapping: Home = Plan & budget; Shop = Plan & budget + Stay safe; School and Hospital = Save & manage; Bank = Understand investing (Time Machine). Phone scams = Stay safe.

**Paisa Times**
- Articles are **short, original explainers written by us** about real-world money topics (UPI fraud, inflation and prices, interest rates and family loans, loan-app rules, payment safety). Never copy or closely paraphrase real news articles. No market tips, stock/fund news or anything that recommends an investment.
- Any real figure (a rate, a price, a date) is checked by a human before publishing (`meta.factsCheckedBy`). Each edition is dated.
- Editions ship in the content pack, so they work offline. Scaling story: Claude drafts each weekly edition, a human reviews it through the same workflow as scenarios.
- `[[termId]]` in article text renders as a tappable word: dotted marigold underline → thought-cloud popup (word, simple meaning, everyday example, speaker button). Tapped words go to the Word Wallet.
- One question per article with an explanation. A correct answer pays the wage via `earn(state, wage, "news:<edition>:<articleId>")`; a wrong answer shows the explanation and allows one retry at half wage. Each edition pays once.
- The reward is framed as the character's **paper-route shift** (earned income), never free money.

## 6. UI standards (UI-1 and UI-2)

- Follow `DESIGN.md` (colours, type, motion, illustration, sound, voice). UI-1 owns it; nobody restyles shared components locally.
- **Mobile-first, 360 px wide**, tested on Chrome DevTools "Slow 4G" with CPU 4× slowdown. Initial JS budget: aim under ~250 KB gzipped; lazy-load places, mini-games and the Recap.
- Font ≥ 16 px (Noto Sans; Baloo 2 for display); tap targets ≥ 48 px; 8 px grid.
- **Jar colours** (always with icon + label, never colour alone): Needs teal, Wants amber, Goals purple, Savings green.
- Every choice has an **icon + short label**. Jargon always followed by a one-line "what this means".
- Respect `prefers-reduced-motion`; provide a **data-saver** toggle that disables animation.
- Show **offline / sync status as a banner**, not as a separate screen.
- Android hardware back always goes up one level; it never exits the app from inside a place.
- No timers by default (anxiety).
- Build order (UI-1): Map → week pins → Place scene + decision → Consequence + rewind → Phone layer + scams → Home (payday, sleep, Month Recap) → Shop sub-map + remaining places → flashbacks → Settings → demo panel.
- Build order (UI-2): Onboarding → main screen (hub) → Paisa Times reader → thought-cloud popup → questions + wage → Word Wallet → dashboard. Message Inspector, Scam or Safe? and Time Machine need an owner.
- Dashboard screens: Sign in → Class setup (code + QR) → Class progress table → Learning gains chart.
- Component names to reuse: `RoomHub`, `MapView`, `PlacePin`, `PlaceScene`, `DialogueBubble`, `PhoneNotification`, `ChatThread`, `WalletCard`, `JarCard`, `JarDelta`, `ChoiceButton`, `ConsequenceSheet`, `LessonCard`, `RewindButton`, `FlashbackCard`, `MonthRecap`, `ScoreRing`, `NewsFrontPage`, `ArticleView`, `GlossaryWord`, `ThoughtCloud`, `WordWallet`, `SwipeCard`, `MessageInspector`, `TimeSlider`, `GrowthChart`, `AssumptionBanner`, `OfflineBanner`.
- The UI talks to the engine **only through the engine API** (5.2) and to the backend **only through `api-client`**. Develop against the mock engine (`packages/engine/src/mock.ts`) until the real one lands.

## 7. Content, AI usage and guardrails

### 7.1 Where Claude is used (and where it is not)

- **Authoring time (yes):** Claude drafts scenarios, newspaper articles, glossary entries, quiz questions, lesson cards and Hindi translations as JSON matching the schemas. Output is validated by zod and the guardrail linter, then **a human reviews it and flips `status` to `reviewed`**.
- **Runtime in the student app (no):** no live LLM calls. Reasons: works offline, no child data sent anywhere, fully predictable, nothing to go wrong on stage. This is a deliberate safety and scale decision; say so in the pitch.
- Optional stretch (only before freeze): a facilitator-side "summarize where my class is struggling" using aggregated, anonymized counts, with the API key held server-side only.

### 7.2 Guardrail rules (enforced by `pnpm lint:content`)

1. Schema valid (zod); 2–4 choices; ids unique; every scenario has a valid `location`; every `[[termId]]` exists in the glossary.
2. Every `t:` key exists in **en and hi**. Missing Hindi = build failure.
3. **Educate, never recommend.** No imperative investment advice ("you should invest/buy…"), no guarantees ("guaranteed", "sure returns", "risk-free"), no real banks, funds, stocks, apps or schemes named as something to choose. Forbidden-term list lives in `packages/content/guardrails.json` and is reviewable by non-developers. Applies to articles too.
4. Investing content only uses **fictional assets**: "Steady Deposit", "Mixed Basket", "Rocket Co".
5. Any scenario with `assumption: true` or in `understand_investing` must render `AssumptionBanner`. Projections come only from `projectGrowth` (always a range).
6. Safe outbound links only: the 1930 cyber crime helpline and cybercrime.gov.in.
7. Tone: no shaming of poverty or family situations; no preaching; reading level about Class 8; text length caps per field (story ≤ 220 chars, choice label ≤ 40, lesson ≤ 140, article body ≤ 600, glossary simple ≤ 100).
8. `--strict` mode (used for release builds) also fails on any `status: draft` and on any article without `factsCheckedBy`.

### 7.3 Hindi rules

- Keep common terms students hear in English (UPI, OTP, EMI, KYC) and add a short Hindi explanation.
- Use one consistent glossary: `packages/content/glossary.hi.json` (e.g. emergency fund → आपातकालीन बचत). Reuse it in every prompt that generates Hindi.
- Conversational Hindi, not formal Hindi.
- A Hindi-speaking teammate spot-checks at least the 10 most-used cards and all 5 articles before the demo.

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

**Merge checkpoints:** 23:30, 01:30, 03:15, 07:30. `main` must be deployable after each.

**Definition of done per checkpoint**

- **M1:** the approach PDF is submitted. Build target: shell, onboarding and room deployed; contracts in this file frozen.
- **M2:** the progress PDF is submitted and all code is pushed. Build target: room → map with pins → a place → dialogue decision → consequence + rewind → a scam notification → sleep → Month Recap, playable end to end; Paisa Times with word popups, questions and wage; Hindi complete for everything built; engine tests green; guardrail linter in CI; deployed.
- **Freeze (08:30):** + Shop sub-map, all 5 places, flashbacks, Scam or Safe?, Time Machine, offline sync, dashboard, baseline/end-line quiz and learning-gain chart, demo mode + hidden panel. After this: bugs, copy, polish only. Start the final report and record the demo video now.
- **Final submit (10:30):** clean `main`, README (build/run steps only), `LICENSE`, `.env.example`, no secrets, deployed link works on a phone, zip uploaded, final report PDF (≤ 3 pages), demo video (≤ 4 min, voiceover).

Sleep in staggered shifts (min. 3 hours each), roughly Sun 01:00–04:00 and 04:00–08:00. Tired teams ship bugs.

## 9. Demo script and fallbacks

The same story is used for the **demo video (≤ 4 min, voiceover)** and the **live presentation** (cut steps 8–9 live if the slot is 3 minutes).

1. **Hook (15 s):** the problem and who it is for (Class 11–12, underserved Hyderabad).
2. **Onboarding (20 s):** pick Hindi, enter class code, avatar, persona Sana.
3. **Room → Map (15 s):** the room; the door opens onto the neighbourhood; this week's pins glow.
4. **Shop (45 s):** dialogue decision at the phone shop → consequence → **rewind** → lesson. A scam notification drops in; Message Inspector.
5. **Hospital (20 s):** an emergency bill; a flashback to an earlier choice; the emergency fund saves the day.
6. **Home (25 s):** sleep → Month Recap with Money Health Score.
7. **Paisa Times (20 s):** tap a word → thought cloud; answer the question; the paper-route wage lands in the wallet.
8. **Bank (15 s):** Time Machine; point at the AssumptionBanner and the low/avg/high range.
9. **Offline + NGO view (25 s):** airplane mode, keep playing, reconnect and sync; dashboard with learning gains (labelled demo data).
10. **Close (15 s):** scale story and the rubric map.

**Demo mode:** `?demo=1` loads a seeded save (fixed seed, mid-month state). A hidden panel (triple-tap the logo) jumps to any place, triggers payday, ends the week, opens the Recap, fires the scam notification or a flashback, marks a new edition, simulates offline, switches persona and resets.
**Fallbacks:** the submitted demo video, a seeded database, and a local build on a laptop. Mirror a real phone to the projector with `scrcpy`.

## 10. Pitch slides (5) and the rubric map

1. Problem and audience. 2. The experience (clip or live). 3. **Rubric map:** each success measure → the feature that delivers it. 4. Scale: 1,500 students first, cost per student, how an NGO onboards a school, language roadmap, weekly Paisa Times pipeline. 5. Guardrails and privacy.

| Brief measure | What we show |
|---|---|
| Simple | Starter level, "what this means" lines, thought-cloud word popups, 2–4 icon choices |
| Relatable | Hyderabad neighbourhood map, local scenarios (bus pass, Bonalu/Eid/Diwali, recharge), persona backstories, real-world topics in Paisa Times |
| Persona-led | Sana vs Ravi get different rooms, income, goals and events |
| Language-ready | Live en/hi switch, string-file architecture, new language = one file |
| Game-based | Map + weekly simulation, rewind, mini-games, paper-route rewards, baseline vs end-line quiz |
| Intuitive UI | Room hub with labelled objects + tab bar, guided first pin, first decision in under 3 minutes |
| NGO-integrated | Class code/QR, progress table, learning-gain view |
| Guardrail | AssumptionBanner, fictional assets, original-only news, content linter, "educate, don't recommend" |

Note: the brief's heading says "six measures" but lists seven. We cover all seven; ask the organizers which are scored.

## 11. Testing and pre-submission checklist

- Engine unit tests: determinism, immutability, jars ≥ 0, rewind, delayed effects, serialization, `earn` idempotency, `sleep` blocked while pins remain.
- `pnpm lint:content` passes in `--strict` before the code submission.
- Manual smoke on a real Android phone: install the PWA, play offline, reconnect, sync.
- Run the new-user path from scratch with someone who has never seen the app; time to first decision under 3 minutes.
- Walk every screen in Hindi; fix text overflow.
- Final check: a fresh clone → `pnpm install && pnpm dev:student` works from the README alone.
- `README.md` contains only build and run instructions; `LICENSE` exists at the repo root; the zip archive matches the pushed code.

## 12. Decisions log and open questions

Append decisions here as `YYYY-MM-DD HH:MM — decision — who`.

- 2026-10-10 — Languages: en + hi shipped; Telugu draft-only; Urdu out of scope — team.
- 2026-10-10 — No runtime LLM in the student app; AI used at authoring time with human review — team.
- 2026-10-10 — App = room hub + Map (game) + Paisa Times + Me + Notes; more sections via config — team.
- 2026-10-10 — Map places: home, convenience (Shop, with sub-map), school, hospital, bank; weekly pins, sleep at Home ends the week — team.
- 2026-10-10 — Paisa Times: original explainers bundled in the content pack; reward is an earned paper-route wage, once per edition — team.
- 2026-10-10 22:30 — School opens the Classroom: a repeatable 5-question practice quiz across all four pillars. Its own question bank, separate from baseline/end-line so practice can't inflate learning gain. Additive `QuizKind 'classroom'`; client API built, backend change proposed in `API.md` §5 — UI-1.
- 2026-10-11 — Lanes reassigned: UI-2 owns onboarding, the main screen, Paisa Times and the dashboard; UI-1 owns the map, places, decisions, Home, the classroom and the life meters; `App.tsx` and `src/game/**` are shared — team.
- 2026-10-11 — The Room hub is replaced by a main screen: character on a couch, a Play button to the map, a news rack to Paisa Times — team.
- 2026-10-11 — Translations stay per feature (`content/en.json` + `hi.json` + a small `t()`), not react-i18next: the pattern is already used by three features and keeps the bundle small. Shared game state is one Zustand store (`src/game/useGame.ts`) saved to IndexedDB — team.
- 2026-10-11 02:40 — Frontends wired to the backend. The student app goes only through `apps/student/src/api/` (join/rejoin, tracker + IndexedDB sync queue, `class_status`, offline banner). The staff dashboard is built on `@paisa/api-client`. The start-of-term check is offered in School; the end-of-term check only while the teacher has it open. `class_wellbeing` is not shown on the dashboard (per-child spending; DPDP open question) — BE-2.
- 2026-10-11 05:00 — Day-by-day play: a day count (7 days a week); school, then work, at most once each a day; resting at Home ends the day (Ammi's tuck-in scene). Health and sanity out of 25, every effect halved. Store mini-games: Kirana Run (needs vs wants: needs more sanity per rupee + health, wants more sanity each) and Counter Shift (cash change, UPI checks). Additive contract: `SyncEvent` type `day_rested`; life events keep `day`; `class_wellbeing` gains `rest_days` (migration `20261011130000_daily_life_events.sql`) — UI-1, to review: BE-2.
- 2026-10-11 06:00 — PWA via vite-plugin-pwa 1.0.3 (autoUpdate, generateSW): precaches the shell, every PNG and the woff2 fonts (not .woff); Supabase is NetworkOnly; icons are the Home building sprite on the letterbox purple `#2b1b3d` (also the theme colour) — BE-2.
- 2026-10-11 06:00 — Demo mode keeps its whole save (stores, profile, sync queue) in a separate IndexedDB database `paisa-demo`, chosen by `?demo=1` at load, so it can never overwrite a real student's save; `game/storage.ts` and `onboarding/profile.ts` pass that store to idb-keyval and wait for the seed. A demo joins HYD234 when online (4 s timeout), else plays an offline stand-in that a "stale" class_status never resets — BE-2.
- 2026-10-11 06:00 — The hidden demo panel opens by triple-tapping the day chip, only with `?demo=1` or in dev builds (a student can't wipe their own save by accident). Panel labels are English-only (staff tool). "Simulate offline" pauses sends and shows the banner while the real network stays up — BE-2.
- 2026-10-11 06:00 — Settings (gear on the main screen): language (Telugu only with `VITE_SHOW_DRAFT_LANGS=true`, labelled draft), data saver (`html.data-saver`, same as reduced motion), read-aloud (hidden with no voice; `useVoice` returns null when off) — BE-2.
- 2026-10-11 06:00 — Bank on the map (5th building, between School and Hospital) opens a sheet of practice tools that never touch the wallet: Time Machine (sliders, low/avg/high band, AssumptionBanner always visible, a 3-question "which plan ends with more" round whose ranges never overlap) and Scam or Safe? with the Message Inspector (6 messages a game, 2 of them safe; links only to 1930 and cybercrime.gov.in). AssumptionBanner, GrowthChart and TimeSlider live in features/bank; the phone's Vanguard app imports them. Scam or Safe? is also the phone's fifth app. Both send `minigame_complete` (`time_machine`, `scam_or_safe`); no contract change — UI-1.
- 2026-10-11 06:10 — Bank also offers Jar Splitter as practice (engine jarSplitterRounds/scoreJarSplit; persona's rounds at level 'starter'; sends `minigame_complete` `jar_splitter`). Phone Messages threads get an Inspect button on every thread (scam or not, so it never gives the answer away), with the line-to-reason map in phone/inspect.ts — UI-1.
- 2026-10-11 06:10 — Decision loop wired to the engine: the shared store holds the engine GameState as `plan` (the persona's four-jar monthly plan, persisted, save v4) beside the life wallet; decisions, rewind, flashbacks, payday and the Month Recap run on `plan`. The plan's week ends only on the day-7 rest at Home (blocked while pins remain), so it moves with the life week. A pinned place plays its card before its usual sheet. Demo hooks in `features/decisions/demo.ts` — UI-1.
- 2026-10-11 06:30 — Shop sub-map: the store sheet lists the phone shop, kirana and clothes stall from `places.json`, plus the work counter. A pin with a sublocation plays at its spot (the badge is there); tapping the Shop on the map plays only a pin at the Shop itself. The kirana otherwise opens Kirana Run — UI-1.
- 2026-10-11 07:00 — The dashboard counts decisions per card, not per week: the decision loop pins 2–4 cards a week, so `class_progress` keys a decision by month + week + `scenarioId` (a re-made card still replaces the old choice; a rewind hides only its own card). Migration `20261011150000_decisions_per_card.sql`, no contract change — BE-2.
- 2026-10-11 06:45 — The map is a town built from the Kenney RPG Urban Kit only (tools/build-world.py), the same CC0 kit as the buildings, replacing the forest backdrop whose source pack is not in the repo. Five building lots in two rows inside the 352x380 play area (Home, School, Shop; Bank, park and fountain, Hospital), so a 360 px phone sees all of them; outer blocks have muted, unlabelled background buildings, parks and car parks. The five places always show an outline and a pixel shadow (*-outline.png from build-sprites.py); the Bank roof is navy and the Hospital roof white so neither melts into the grey pavement. The camera centres the play area below the meters bar — UI-1.
- 2026-10-11 07:15 — The map breathes: trees near the play area sway, cars drive the nearby streets (keeping left), and a gust of leaves crosses the top every 16 s (src/screens/WorldLife.tsx; positions and sprites from tools/build-world.py). CSS transforms only; reduced motion and data saver stop all of it — UI-1.
- 2026-10-11 07:25 — Staff sign in with email + password, not an emailed code. Only emails on the staff list can create an account (auth hook `staff_signup_gate`); `pnpm staff:invite` just adds the email. Reset links come by Gmail SMTP, locally too. api-client: `signInWithEmail`/`verifyEmailCode` removed, sign-up/reset/set-password added (`packages/shared/changes/20261011-0725-ui2-staff-password-signin.md`) — UI-2, to review: BE-2.
- 2026-10-11 07:35 — Map buildings get their own silhouettes, hand-drawn in the Kenney palette (tools/building_art.py): Home with a gable roof and chimney, a Japanese-style School with a central clock tower, a classical Bank (navy pediment, gold coin, columns), a Hospital with a taller cross tower. The Shop stays the square tile-built block. Same 88x104 sprites, so no code change — UI-1.
- 2026-10-11 07:50 — Two building icon sets, five sprites each in map order: set1.png (flat, front-on, the Shop redrawn to match) and set2.png (the Kenney 3D view: the kit's Shop, the other four redrawn with roofs seen from above). Built by tools/build-icon-sets.py into public/assets/buildings/set1.png, set2.png and set1/, set2/ (same names and size as the map sprites). The map uses set2 (build-sprites.py draws it from building_art_3d.py), chosen by the team — UI-1.

Open questions:
- Which license does Section 11 of the brief require for the `LICENSE` file?
- Which success measures are scored: six or seven?
- Compliance-approved assumed growth rates for Time Machine (placeholders: 4/8/12%).
- Who is the native Telugu reviewer, if any, via the NGO partner?
- Which further app sections (if any) to add after the demo path is done?