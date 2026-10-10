# BE-1: map, Paisa Times and classroom contracts (CLAUDE.md 5.1, 5.5, 5.7)

Date: 2026-10-10 23:20 IST. Lane: BE-1. Additive only: nothing renamed or removed, and no
existing engine signature (5.2) changed.

## Types (`packages/shared/src/types.ts`)

- `LocationId = 'home' | 'convenience' | 'school' | 'hospital' | 'bank'`.
- `Scenario` gains `location: LocationId`, `sublocation?: string` (`"<place>.<name>"`, e.g.
  `convenience.phone_shop`), `channel: 'in_person' | 'phone'` and `speaker: TKey`. `EventCard`
  inherits them. **Required on every card**: all 24 scenarios and 10 events are tagged, with
  `speaker.*` strings in en and hi.
- `GameState.earned: string[]`: source ids already paid by `earn()` (rule 7). `createGame`
  starts it empty.
- `GlossaryTerm` and `Article` exactly as in 5.1.
- `Place` (new, for `places.json`, 5.8): `id` (a `LocationId`, or `"<parent>.<name>"` for a
  sub-map location), `name`, `parent?`, `position {x, y}` in percent, `illustration?`,
  `children?`, `unlock? {month?, requiresFlag?}`.
- `ContentBundle` gains optional `places?`, `glossary?` and `news?`, so existing bundles still
  type-check.
- `QuizType` adds `'classroom'` (the School practice quiz). Only baseline and endline feed
  `learning_gain`; the SQL already stores classroom results as events only (PR #8).
- `SyncEventType` adds `map_opened`, `location_selected`, `week_slept`, `glossary_term_opened`,
  `news_question_answered` and `news_edition_completed`. Payload keys are exactly the ones in
  CLAUDE.md 5.5 (snake_case: `location_id`, `term_id`, `article_id`, `correct_count`, `edition`,
  `attempt`, plus `month`, `week`, `correct`).

## Schemas (`packages/shared/src/schemas.ts`)

- New: `LocationIdSchema`, `SublocationSchema`, `GlossaryTermSchema`, `ArticleSchema`
  (edition `YYYY-Www`; `question.correct` must index an option; optional `meta.factsCheckedBy`),
  `PlaceSchema` (a sub-map location needs its matching `parent`; positions 0–100).
- `ScenarioSchema` / `EventCardSchema` require `location`, `channel` and `speaker`, and check
  that a `sublocation` starts with its `location`.
- `QuizQuestionSchema.quiz` accepts `'classroom'`. `SyncEventSchema.type` accepts the six new types.
- `GameStateSchema.earned` defaults to `[]`, so saves from before this change still load.
- `TKeySchema` now allows capitals and hyphens after the first segment, for the edition keys
  CLAUDE.md 5.7 uses (`t:news.2026-W41.upi_fraud.headline`). The first segment stays lowercase.

## Content

- `speaker.*` strings (16 speakers) in en and hi, capped at 30 characters (`speaker` cap).
- `CONTENT_VERSION` 2026.10.10.2 → 2026.10.10.3.

## For other lanes

- **BE-2:** type the six new event types in `@paisa/api-client` against `SyncEventType`, and
  regenerate `supabase/seed.sql` for 2026.10.10.3.
- **UI:** `LocationId` now includes `bank`; import it from `@paisa/shared` instead of the local
  type in `LocationScreen.tsx`. Every card has `location`, `channel` and `speaker` for pins,
  dialogue scenes and phone chats.
