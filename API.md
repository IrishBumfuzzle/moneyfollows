# API.md: Classroom quiz

The School place on the map opens the **Classroom**, a practice quiz (5 questions by default; the facilitator can change the count and pillars, §5.5). This file covers:

- **§2 Quiz API:** the client API. Built and tested.
- **§4 Sync:** the event the client sends.
- **§5 Backend:** what the backend needs. Proposed, **not built**.
- **§6 UI:** how the screen is put together.

`CLAUDE.md` is still the source of truth for the frozen contracts (§5). Everything here is additive.

| Status | Item |
|---|---|
| ✅ built | Classroom backdrop, Kenney UI kit, `ClassroomScreen`, quiz API, 8 questions (en + hi), unit + browser tests |
| ✅ built | Map → School → Classroom; the back button and Android back return to the map |
| ✅ built | Backend accepts `quiz_type: 'classroom'` (§5.1); `classroom_quiz_summary` (§5.2) |
| ✅ built | Result sent as `quiz_submitted` through the sync queue; quiz logic in `packages/engine`, questions in `packages/content` |
| ✅ built (client) | Classroom setup from the class: question count and pillars (§5.5), with offline fallback |
| 🟡 proposed | Backend: `classroom` setting on the class, returned by `class_status`, set by the facilitator (§5.5). BE-2 to build |

---

## 1. Player flow

```
Map ──tap School──▶ Classroom (intro on the board, "Start")
                     │
                     ▼
        Question n of 5 written on the chalkboard
        2–4 answer buttons (A/B/C/D) ──tap──▶ right answer turns green, a wrong pick turns red
                     │                        feedback panel: "Correct!" / "Not quite" + explanation
                     ▼                        "Next" (last question: "See result")
        Result: score % on the board, per-pillar split, "Play again", "Back to map"
```

- The first answer counts. No retries, no timer (CLAUDE.md §6: no timers).
- Five questions are drawn **across all four pillars** from the classroom bank, so every quiz touches every pillar.
- "Play again" starts a new round with a new seed.
- Leaving mid-quiz drops the session. Nothing is sent for an unfinished quiz.

## 2. Quiz API (client, built)

Code: `apps/student/src/features/classroom/quiz.ts` · types: `.../classroom/types.ts` · tests: `.../classroom/quiz.test.ts`

It follows the engine's rules (CLAUDE.md §4): pure TypeScript, no DOM, no network, no `Date.now()` or `Math.random()`. State goes in and state comes out, inputs are never mutated, and sessions round-trip through `JSON.stringify`. It is written to move into `packages/engine` unchanged.

```ts
startQuiz(bank: QuizQuestion[], opts: QuizOptions): QuizSession
currentQuestion(s): QuizQuestion | null      // null once finished
isAnswered(s): boolean                       // current question has an answer
answer(s, choice: number): { session: QuizSession; feedback: AnswerFeedback }
next(s): QuizSession                         // only after the current question is answered
isFinished(s): boolean
result(s): QuizResult                        // only when finished
toSubmittedEvent(result, ctx): SyncEvent     // the quiz_submitted event (§4)
```

```ts
interface QuizOptions {
  kind: 'baseline' | 'endline' | 'classroom';
  seed: number;                 // same bank + seed → same questions and option order
  quizId?: string;              // sent with the result; defaults to kind
  count?: number;               // default: all matching; classroom uses 5
  pillars?: Pillar[];           // default: all four
  feedback?: 'instant' | 'end'; // default: instant for classroom, end for baseline/endline
}

interface QuizSession {
  version: 1; quizId: string; kind: QuizKind; seed: number; feedback: 'instant' | 'end';
  questions: QuizQuestion[];    // play order, options in display order, `answer` re-pointed
  order: number[][];            // order[q][displayIndex] = index in the content's options
  index: number;                // current question; === questions.length when finished
  answers: QuizAnswer[];        // one per answered question
}

interface AnswerFeedback {
  questionId: string;
  correct: boolean;
  correctChoice: number | null; // display index; null in 'end' mode
  explanation: TKey | null;     // null in 'end' mode
}

interface QuizResult {
  quizId: string; kind: QuizKind;
  score: number;                // 0–100, Math.round(100 * correct / total)
  correct: number; total: number;
  answers: QuizAnswer[];
  byPillar: Partial<Record<Pillar, { correct: number; total: number }>>;
}
```

**Rules (each one has a unit test):**

1. **Deterministic.** The same `(bank, opts)` always gives the same session.
2. **Pillar spread.** Questions are drawn round-robin across pillars, and each pillar's pool is shuffled by seed.
3. **Shuffled options, stable answer.** Options are shuffled per question, and `answer` follows its option.
4. **`QuizAnswer.choice` is the un-shuffled index** (the order in the content file). The dashboard can then tell which wrong option is picked most, whatever order each phone showed. ⚠️ `scoreQuiz` on `origin/Backend` stores the *shuffled* index. Pick one when merging; this doc recommends un-shuffled.
5. **First answer counts.** Answering twice, skipping ahead or answering after the end throws.
6. **Immutable and serializable.** Inputs are never mutated, and a session can be saved mid-quiz and resumed.
7. **`'end'` mode reveals nothing.** No right answer and no explanation until the result. This is for baseline and end-line tests.

**Errors:** `QuizError` with a `code`:
`empty_bank | bad_count | finished | already_answered | not_answered | bad_choice | not_finished`.

**Example:**

```ts
let s = startQuiz(CLASSROOM_BANK, { kind: 'classroom', seed, count: 5 });
const { session, feedback } = answer(s, 2);     // display index the student tapped
s = next(session);
// …repeat until isFinished(s)
const r = result(s);
queue.enqueue(toSubmittedEvent(r, { event_id: uuid(), anon_id, class_id, client_ts: new Date().toISOString(), content_version }));
```

## 3. Content

Files: `apps/student/src/features/classroom/content/`

| File | What |
|---|---|
| `questions.json` | `QuizQuestion[]`, `quiz: "classroom"`, 2 per pillar (8 total), `status: draft`, `author: claude` |
| `en.json`, `hi.json` | UI strings (`classroom.*`) and question strings (`quiz.classroom.*`), same keys in both |
| `index.ts` | `CLASSROOM_BANK`, `CONTENT_VERSION`, and a tiny `t(lang, key, vars)` until react-i18next lands |

The question shape is the same `QuizQuestion` as `packages/shared` on `origin/Backend`, plus `quiz: 'classroom'`.

Keys follow the id: `quiz.classroom.<pillar-short>.<concept>.{q,o1..o4,why}`.

**To add a question:**

1. Add the entry to `questions.json`.
2. Add its strings to **both** `en.json` and `hi.json`.
3. Run `pnpm test`.

The content tests enforce:

- unique ids, 2–4 options and a valid `answer`;
- at least 2 questions per pillar;
- every key present in en and hi;
- length caps: question ≤ 220, option ≤ 40, explanation ≤ 140;
- the forbidden-word list from CLAUDE.md §7.2.

Investing questions use only the fictional assets (Steady Deposit, Mixed Basket, Rocket Co).

Classroom questions are deliberately **separate from the baseline and end-line questions**. Practising the test questions in class would inflate the learning-gain numbers.

The Hindi is a machine draft. A Hindi speaker should check it (CLAUDE.md §7.3) before the strings are marked reviewed.

## 4. Sync: what the client sends

At the end of a quiz, the client builds one `SyncEvent` (CLAUDE.md §5.5) with `toSubmittedEvent` and queues it for `push_events`:

```jsonc
{
  "event_id": "uuid made on the device",   // idempotency key
  "anon_id": "…", "class_id": "…",
  "type": "quiz_submitted",
  "payload": {
    "quiz_type": "classroom",               // 'baseline' | 'endline' | 'classroom'
    "quiz_id": "classroom",                 // which quiz; lets the backend group classroom rounds
    "score": 80,                            // 0–100
    "answers": [ { "questionId": "quiz.classroom.safe.otp", "pillar": "stay_safe", "choice": 1, "correct": true } ]
  },
  "client_ts": "2026-10-10T16:30:00.000Z",
  "content_version": "classroom-2026-10-10"
}
```

Unfinished or abandoned quizzes send nothing. "Play again" sends one more event (new `event_id`).

> ⚠️ **Today's backend (`origin/Backend`) silently skips this event.** `quiz_payload_ok` only accepts `baseline | endline`, and `push_events` drops payload keys it doesn't list, so `quiz_id` would go too. Nothing breaks, because the event is skipped and not counted, but nothing is stored either. Hook the client up to the queue only after §5.1 ships.

## 5. Backend API (proposed, not built)

The backend is owned by BE-2. Each change below is additive.

### 5.1 Accept classroom attempts in `push_events`

```sql
-- quiz_payload_ok: allow the new type
if p ->> 'quiz_type' is null or p ->> 'quiz_type' not in ('baseline', 'endline', 'classroom') then
  return false;
end if;

-- event_payload_keys('quiz_submitted'): also keep quiz_id
when 'quiz_submitted' then array['quiz_type', 'quiz_id', 'score', 'answers']

-- push_events: only baseline/endline become quiz_attempts rows; classroom stays in events
if ev_type = 'quiz_submitted' and clean ->> 'quiz_type' in ('baseline', 'endline') then
  insert into public.quiz_attempts …;   -- unchanged
end if;
```

> ⚠️ **All three changes are needed together.** If only `quiz_payload_ok` is widened, the existing insert into `quiz_attempts` breaks on its `check (quiz_type in ('baseline','endline'))` and raises an error. That aborts the **whole `push_events` batch**, other students' events included.

**Why `events` and not `quiz_attempts`?**

- `quiz_attempts` allows one row per student per quiz type, and `learning_gain` reads from it. Classroom rounds are repeatable practice and must not touch learning gain.
- Classroom answers live in `events.payload`, which already has the `(class_id, type)` index.

`quiz_id` passes the existing string filter (`^[A-Za-z0-9_.:-]{1,64}$`).

### 5.2 `classroom_quiz_summary(class_id uuid)`: facilitator dashboard

This is a facilitator-only RPC, with the same RLS check as `class_progress`. It returns one row per question that the class has answered:

| Column | Type | Meaning |
|---|---|---|
| `question_id` | text | e.g. `quiz.classroom.safe.otp` |
| `pillar` | text | one of the four pillars |
| `attempts` | int | answers from the class (every round counts) |
| `students` | int | distinct students who answered it |
| `correct_pct` | numeric | percent of answers that were right |
| `top_wrong_choice` | int \| null | most-picked wrong option (content order), for "where is my class struggling" |

```sql
select a ->> 'questionId' as question_id, a ->> 'pillar' as pillar,
       count(*) as attempts, count(distinct e.anon_id) as students,
       round(100.0 * avg((a ->> 'correct')::boolean::int), 1) as correct_pct,
       mode() within group (order by (a ->> 'choice')::int)
         filter (where not (a ->> 'correct')::boolean) as top_wrong_choice
  from public.events e, jsonb_array_elements(e.payload -> 'answers') a
 where e.class_id = $1 and e.type = 'quiz_submitted' and e.payload ->> 'quiz_type' = 'classroom'
 group by 1, 2;
```

`api-client` addition: `classroomQuizSummary(classId): Promise<ClassroomQuizSummaryRow[]>`.

### 5.3 Optional: `class_progress` column

`classroom_best_score int | null`: each student's best classroom score, for the progress table.

### 5.5 Classroom setup per class (proposed, client built)

The number of questions per round is no longer hard-coded. The facilitator sets it for the class, optionally limited to some pillars (e.g. only **Stay safe** the week the class covers scams).

**What the app reads:** an additive `classroom` field on `class_status(anon_id, class_id)`:

```jsonc
// class_status → { endline_open, default_lang, rejoin_code, classroom? }
"classroom": { "count": 8, "pillars": ["stay_safe", "save_manage"] }   // pillars optional; absent = all four
```

**What the app does with it** (`apps/student/src/features/classroom/config.ts`):

| Server sends | App plays |
|---|---|
| nothing (today's backend), or offline | the last setup it saved for this class, else **5 questions, all pillars** |
| `count` | that many, clamped to 1..questions available |
| `count` not a number | 5 |
| `pillars` | only those pillars; unknown names are dropped; an empty or unusable list means all four; the count is capped to what those pillars have |

- It asks each time School opens and waits at most **1.5 s** (`CONFIG_TIMEOUT_MS`); a slow or missing answer uses the saved setup, so the classroom never hangs offline.
- A good answer is saved in IndexedDB (`paisa.classroom.config`) for offline play.
- The round is built by the engine: `startQuiz(bank, { kind: 'classroom', seed, count, pillars })`. The bank has 8 questions today (2 per pillar); add questions in `packages/content/quizzes/classroom.json` to allow longer rounds.

**What BE-2 needs to add (additive):**

1. `classes.classroom_count int not null default 5 check (classroom_count between 1 and 24)` and `classes.classroom_pillars text[]` (null = all), constrained to the four pillar ids.
2. Return them from `class_status` as `classroom: { count, pillars }` (omit `pillars` when null).
3. A facilitator-only setter with the same RLS check as `set_endline_open`, e.g. `set_classroom(class_id, count, pillars)`, and `ApiClient.setClassroom(classId, count, pillars?)` plus the field on `ClassStatus` in `packages/shared` (additive; announce it).
4. The dashboard's class settings get a "Questions per classroom round" number and pillar checkboxes.

`quiz_submitted` already carries the answers, so results need no change; `classroom_quiz_summary` keeps working for any count.

### 5.4 Not needed

- **No endpoint to fetch questions.** Questions ship in the app bundle, like every content pack, so the classroom works offline.
- **No server-side scoring.** The client sends `correct` for each answer, the same way baseline and end-line already work.

## 6. UI structure

### 6.1 Stage and letterboxing

- The backdrop is `apps/student/public/assets/classroom.png`, **360×640**.
- The room takes x 28–332 with black bars on both sides. On wider screens the page background is black, so the bars simply grow.
- All UI is laid out in stage pixels, and the stage is scaled as one unit:
  - big screens get whole-number zoom (1×, 2×, 3×) for crisp pixels;
  - a short phone (under 640 px tall) gets a fractional fit, so nothing is cut off. A 360×560 viewport gives 0.875.

| Stage region | Pixels | Used for |
|---|---|---|
| Wall | y 8–200 | back button (top-left), banner (centre), progress pips (top-right) |
| Chalkboard slate | x 52–308, y 48–188 | intro text, the question, the result score |
| Floor | y 206–626, x 44–316 | answer buttons, feedback panel, result panel and buttons |

The background art is built by `apps/student/tools/build-classroom.py`, which also writes the UI pieces:

```
cd apps/student && python3 tools/build-classroom.py      # needs Pillow
```

If you move furniture or the board in the script, update the coordinates in `ClassroomScreen.tsx` (`STAGE`) and `classroom.css` (`.cr-board`, `.cr-floor`).

### 6.2 Kenney UI kit (`apps/student/src/design/kenney.css`)

The pieces are 9-sliced with CSS `border-image` and `image-rendering: pixelated`, cut 1:1 from the Kenney sheets into `public/assets/ui/`.

| Class | Tile | Use |
|---|---|---|
| `.k-panel` / `.k-panel-dark` | large (0,0) / (1,0) | parchment / wood panel |
| `.k-btn` | small (3,2) cream | answer button, secondary button (≥ 48 px tall) |
| `.k-btn.is-primary` | small (3,3) blue | Start / Next / Play again |
| `.k-btn.is-correct` / `.is-wrong` / `.is-dim` | small (5,3) green / (1,3) red / (3,1) grey | answer states after a pick |
| `.k-banner` | large (4–6,3) red ribbon | screen title |
| `.k-pip` + `.is-now` / `.is-right` / `.is-wrong` | small round and square | question progress |
| `.k-round` | small (0,2) | round icon button, 48 px hit area |

Colour is never the only signal (CLAUDE.md §6):

- the verdict text says "Correct!" or "Not quite";
- the pips change shape (circle vs square);
- the right answer is always shown.

### 6.3 Text

- Text is real DOM text, not canvas, so screen readers, wrapping and Hindi shaping all work.
- The font is Pixelify Sans, falling back to Noto Sans Devanagari. Body text is 16 px.
- Pixelify draws **5 like S and 2 like Z**, so digits, `%` and `₹` come from Noto Sans through a `unicode-range` face called `Paisa Digits`.
- Ligatures are off, because Pixelify's "fi" reads as "A".
- The board is focused on every question change, and it is `aria-live`.

### 6.4 Navigation

- `App.tsx` pushes a history entry when the classroom opens. Android back and the on-screen back button both return to the map (CLAUDE.md §6).
- Dev URL params:
  - `?screen=classroom` opens the classroom directly;
  - `?lang=hi` switches to Hindi;
  - `?seed=N` fixes the quiz.

### 6.5 Asset licences

Both packs are CC0. Credit them in the README and pitch anyway.

| Asset | Author | Source | Licence | Repo copy |
|---|---|---|---|---|
| Cool School tileset | NettySvit | opengameart.org/content/cool-school-tileset | CC0 | `apps/student/assets-src/coolschool/` |
| UI Pack Pixel Adventure | Kenney | kenney.nl/assets/ui-pack-pixel-adventure | CC0 | `apps/student/assets-src/kenney-ui/` |

## 7. Testing

| Command | What it checks |
|---|---|
| `pnpm check` (root) | typecheck + all unit tests |
| `pnpm --filter student test` | 22 quiz API and content tests (see below) |
| `pnpm --filter student e2e` | real browser run (see below) |

The unit tests cover determinism, pillar spread, the shuffle, un-shuffled choices, first-answer-only, immutability, JSON round-trip, scoring and rounding, the event payload against the backend's `quiz_payload_ok` shape, and the content guardrails.

**Browser test (`e2e`).** Run `pnpm dev:student` first. Set `CHROME_PATH`, or run `npx playwright install chromium` once.

- Map → School → full quiz in **en** and **hi**, then the result, Play again, Android back and the back button.
- On every screen: nothing drawn outside the stage, no text overflow, answer buttons ≥ 48 px.
- Same `?seed` gives the same quiz.
- Letterboxing at 1280×800 (1×), 1440×1400 (2×) and 360×560 (0.875).
- Screenshots go to `apps/student/tests/e2e-output/`.

The unit tests were mutation-checked: breaking the answer re-pointing, the stored choice, the double-answer guard or the rounding each makes the suite fail.

## 8. Hand-off: what's next

1. **BE-2:** build §5.1, and §5.2 if the dashboard wants it. Add `'classroom'` to `QuizType` in `packages/shared` (additive; announce it in the team channel).
2. **After `origin/Backend` merges into main:**
   - delete `classroom/types.ts` and import from `@paisa/shared`;
   - move `quiz.ts` into `packages/engine` (BE-1), next to `quizFor` and `scoreQuiz`, and settle rule 4 (un-shuffled vs shuffled `choice`);
   - move `questions.json` to `packages/content/quizzes/classroom.json` and the strings into `packages/content/i18n/{en,hi}.json`, so the content linter covers them.
3. **Wire sync:** in `App.tsx`, `onFinish` only logs today. Replace it with `queue.enqueue(toSubmittedEvent(r, …))` from `api-client`'s sync queue, once §5.1 ships and onboarding gives us `anon_id` and `class_id`.
4. **i18n:** swap the local `t()` for react-i18next once it lands. The keys stay the same.
5. **Content review:** a Hindi speaker checks `hi.json`, and a human flips `status` to `reviewed`.
6. **Open questions:**
   - Should a classroom round give XP or a badge? It must not give in-game rupees; the paper route is the only earned wage.
   - Should School pin a classroom quiz in the weekly loop (CLAUDE.md §5.8)?
