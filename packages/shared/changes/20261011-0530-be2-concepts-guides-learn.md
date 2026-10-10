# Concepts, real-life guides and guide_completed (additive)

Date: 2026-10-11 05:30 IST. Built by BE-2 across lanes (agreed with the team lead for the freeze).
Migration `20261011140000_guide_completed.sql`.

## `packages/shared` (additive)

- New `Concept` (`id`, `pillar`, `name`, `simple`) and `ConceptSchema`.
- New `Guide` (`id` like `guide.bank_account`, `pillar`, `icon`, `concepts`, `title`, `intro`,
  `steps`, `check { prompt, options, correct, explanation }`, `meta` with optional
  `factsCheckedBy`) and `GuideSchema`.
- `SyncEventType` and the zod `SyncEventSchema` enum gain `guide_completed`.

Nothing was renamed or removed. `ContentBundle` is unchanged.

## `packages/content`

- `concepts.json`: 29 concepts, the one list every `concept` tag must use. Two classroom tags were
  renamed to the scenarios' spelling: `risk_and_return` to `risk_return`, `upi_collect_request` to
  `upi_collect`. No code read concept tags before this.
- `guides/real-life.json`: 6 guides (bank account and KYC, UPI safety, if you are cheated online,
  your first pay, reading a bank message, the real cost of a loan), en + hi, all `draft` until a
  human checks the facts and sets `factsCheckedBy`.
- Exports `concepts` and `guides` (outside `ContentBundle`, like `badges`). Subpath exports
  `@paisa/content/concepts.json` and `@paisa/content/quizzes/*` for the dashboard's lazy loads.
- Linter: `unknown_concept`; guides get every text check and caps (`conceptName` 30,
  `guideTitle` 50, `guideStep` 160); `--strict` needs `factsCheckedBy` on guides.
- `CONTENT_VERSION` 2026.10.11.1.

## Backend and `@paisa/api-client`

- `push_events` accepts `guide_completed { guide_id, correct }` (type CHECK and payload keys
  changed together). `SyncEventPayloads` types it.

## Apps

- Student: a Learn button on the main screen opens Learn (lazy chunk): Real life (the guides),
  My progress (each concept not yet / met / understood, worked out on the phone) and Notebook
  (every lesson seen, plus saved Paisa Times words). Answered events and finished quizzes feed it;
  the start- and end-of-term checks count for progress but add no notes, so the Notebook never
  becomes an answer sheet for the end-line quiz. Saved on the phone only (`paisa.learning`).
- Dashboard: Learning gains has a new "Ideas the class understands" card: the practice quiz
  results grouped by concept, weakest first.
