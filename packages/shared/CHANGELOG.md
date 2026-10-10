# @paisa/shared changelog

Contracts are frozen at v0 (CLAUDE.md section 5). Additive changes are allowed when announced in the team channel; list them here.

## v0 + additive (2026-10-10, BE)

The section 5.1 types are exactly as written in CLAUDE.md. Additive and announced:

- `Choice.rating?` ('best' | 'ok' | 'risky'): drives the selector and badges; never shown as right/wrong.
- `GameState` optional engine-internal fields: `stage`, `monthStart`, `scores`, `lessons`.
- Types the engine API (5.2) names but 5.1 did not define: `Card`, `Consequence`, `AppliedEffects`, `MonthReport`, `ScoreParts`, `Projection`, `GrowthRates`, `PendingEffect`.
- Content types: `EventCard`, `Persona`, `QuizQuestion`, `QuizAnswer`, `ScamMessage`, `ContentBundle`.
- Backend types (5.5): `SyncEvent`, `JoinClassResult`, `PushEventsResult`, `ClassProgressRow` (5.5 columns plus `lang`, `decisions`, `pillars`, `baseline_score`, `endline_score`), `LearningGainRow`.
- Engine API: `createGame` takes an optional 4th argument `content` (defaults to the bundled content). To move past a month-end card, call `choose(state, content, CONTINUE)`.
- Constants: `GAME_MONTHS` = 3, `WEEKS_PER_MONTH`, `REWIND_TOKENS_PER_MONTH`, `LEVEL_MAX_DIFFICULTY`, `EVENT_CHANCE`, `MHS_WEIGHTS`, `SAVINGS_TARGET`, `GROWTH_RATES`, `CONTINUE`, `SYNC_BATCH_MAX`.
- zod schemas for every content file, `SyncEvent` and the i18n files.
