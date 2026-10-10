# @paisa/contracts changelog

Every change to this package gets an entry, and both track owners approve the PR.
Mark breaking changes **BREAKING** and say what consumers must change.

## 0.2.0 — game, content model and API DTOs (additive)

All additions; every v0.1 document still parses.

- Content: optional `debt` and `flags` on `Effects`, `debt` on `DelayedEffect`; optional `icon` and `rating` on `Choice`; optional `requiresFlag` and `assumption` on `Scenario`.
- New content schemas: `EventCard`, `Persona` (with `IncomeModel`, `JarSplit`, `JarBalances`), `Reflection`, `QuizQuestion`, `ScamMessage` (with `MessageSegment`), `Tuning`.
- `ContentSource` gains `events`, `personas`, `reflections`, `quizQuestions`, `scamMessages` (default `[]`) and optional `tuning`. New `GameContent` (what the engine needs), `ContentPack`, `PackManifest`.
- Game: `GameState`, `GameSnapshot`, `NewGameInput`, `Action`, `View` (card, consequence, month_end, done), `Hud`, `Notice`, `Outcome`, `MonthReport`, `ScoreParts`, `GameEvent`, `StepResult`, `Projection`, `QuizResult`.
- Events: `SyncResult`, and payload schemas for `decision_made`, `rewind_used`, `module_complete`, `minigame_complete`.
- API DTOs: join and profiles, games, quizzes, projection, staff OTP, organisations, centres, classes, progress, learning gains.

## 0.1.0 — scaffold

- Content enums: pillars, jars, personas, languages.
- `Scenario`, `Choice`, `Effects` (with `delayed`), `TKey`, `StringTable`, `ContentSource`, matching the scenario example in the product design.
- `SyncEvent` envelope and `SyncBatch`, with the 12 core event types.
