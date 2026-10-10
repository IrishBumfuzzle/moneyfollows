# BE-1: the map and week loop in the engine (CLAUDE.md 5.2, 5.8)

Date: 2026-10-11 00:10 IST. Lane: BE-1. Additive only. The existing 5.2 functions keep their
signatures; `choose` gains an optional fourth argument.

## Shared additions (`packages/shared`)

- `WeekPin { location, sublocation?, scenarioId, kind: 'decision' | 'event', played }` and an
  optional `GameState.pins?: WeekPin[]`, with a schema. Saves without `pins` still load; the
  engine rebuilds the same pins from the state.
- `DECISIONS_PER_WEEK = { starter: 2, explorer: 3, planner: 3 }`.
- `EARN_JAR = 'wants'`: where `earn()` pays unless the caller names a jar.

## How the week works

- **Pins.** When a week starts, the engine pins `DECISIONS_PER_WEEK[level]` decisions, plus the
  week's surprise event when its roll hits (`EVENT_CHANCE`). That makes 2–4 pins. The decisions
  are different scenarios, at different places while the content allows it. Each pin keeps its
  card's `location` and `sublocation`, so the map can show it. Over 12 weeks that is 24
  decisions at starter (the 24-card pack, with repeats limited by the recency rules) and 36 at
  explorer and planner.
- **Stage.** `stage` is `'event'` while the week's event pin is unplayed, else `'decision'`, as before.
- **Classic loop, unchanged for existing callers.** `nextCard` returns the next unplayed pin,
  with the event first. `choose(state, content, choiceId)` plays it, and after the last pin it
  ends the week itself. `scripts/seed-data.ts`, the demo save and the old tests use this loop.
- **Map loop.**
  1. `pinsForWeek(state, content)` lists the unplayed pins.
  2. `playAt(state, content, location, sublocation?)` returns the card pinned there, or null.
     A place alone also matches pins inside its sub-map.
  3. `choose(state, content, choiceId, { scenarioId })` plays that pin, in any order, and
     never ends the week.
  4. `sleep(state, content)` ends the week:
     - it throws `pins_remaining` while any pin is unplayed (rule 8);
     - after week 4 it opens the month-end report and records the score;
     - at the report it starts the next month with payday, the same as choosing `continue`;
     - at year end it throws `game_over`.
- **`sleepStep(state, content)`** does what `sleep` does and also returns
  `{ landed, payday? }`. The UI uses it for flashbacks (delayed effects that landed) and payday.
- **`earn(state, amount, sourceId, jar = 'wants')`** pays whole rupees once per `sourceId`
  (rule 7); a repeat returns the same state object. A zero wage still records the source.
  Rewind restores the exact earlier state (rule 4), so a rewind past an `earn` undoes the
  wage and its id together.
- **Score.** The Money Health Score is unchanged (5.3). It still comes from the month's payday
  baseline, now over more decisions a month. Earned wages count as money in the jars.
- **Rewind.** One snapshot per pin played, 3 tokens a month, and never across a month boundary.

## New engine exports and error codes

- **Exports:** `pinsForWeek`, `playAt`, `sleep`, `sleepStep`, `earn`, `SleepResult`.
- **Error codes:** `not_pinned` (the target isn't an unplayed pin), `pins_remaining` (sleep
  blocked), `sleep_required` (every pin played, so `nextCard`/`choose` ask for sleep) and
  `invalid_earn`.

## For other lanes

- **UI:**
  - Show the map from `pinsForWeek`, open cards with `playAt`, and play them with
    `choose(..., { scenarioId })`.
  - Sleep at Home with `sleepStep`, then show `landed` as flashbacks.
  - Paisa Times wages use `earn(state, wage, "news:<edition>:<articleId>")`, and XP uses
    `awardXp(rewards, xp, "news:<edition>:<articleId>")`.
  - Emit `week_slept { month, week }` after `sleep`.
- **BE-2:** the demo seed now plays 2–3 decisions a week (the same classic loop). Regenerate
  `supabase/seed.sql`.
