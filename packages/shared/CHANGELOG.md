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

## v0 + additive 2 (2026-10-10, BE-1 engine fixes)

No type or field was renamed or removed; the engine API (5.2) signatures are unchanged. Additive or validation-tightening only:

- Types (additive, optional):
  - `PendingEffect.principal?`: savings/goals principal a pending payoff returns, so the score counts in-flight investing as saved.
  - `GameState.monthStart` gains `paydaySaved?`, `inFlight?` and `baseIncome?`.
- Semantics: `monthStart.needsBudget` is now one month of Needs, meaning the persona's Needs share. It used to add the fixed costs a second time. The Money Health Score `s` now counts the payday split. `d` uses `baseIncome` in a zero-income month.
- Constants (additive):
  - `MAX_DELAY_WEEKS` = 11;
  - the selector tuning `RECENT_EVENTS` = 6, `RECENT_DECISIONS` = 3, `UNSEEN_WEIGHT` = 5 and `BASICS_BEFORE_INVESTING` = 2, moved here from the engine.
- Schemas (tightened):
  - `DelayedEffect.afterWeeks` max 52 → 11;
  - `requiresFlag` must match the flag pattern `^[a-z0-9_]+$`;
  - irregular income needs `min <= max`.
- Schemas (additive): `FlagSchema`, `SeedSchema` (uint32 integer), `PendingEffectSchema` and `GameStateSchema`, which validates saved games and the demo save on load.
- Engine (additive):
  - `quizFor(content, quiz, shuffleSeed?)` shuffles each question's options deterministically, and the answer index follows its option;
  - new export `shuffleOptions`;
  - new `EngineErrorCode` `'invalid_seed'`, thrown by `createGame` for a seed that is not a uint32 integer.
- Engine behaviour:
  - delayed effects due after the last week stay queued, count in `delayedQueued` and settle in the final `continue`'s `landed`;
  - `rewind` returns null at `yearEnd`;
  - a repayment larger than the debt charges only what is owed;
  - the selector never drops its difficulty or starter-investing gates, so it throws `no_cards` if nothing passes them;
  - the recency windows are per card kind.
