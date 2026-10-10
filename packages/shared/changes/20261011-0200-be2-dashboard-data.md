# BE-2: dashboard data, classroom summary, wellbeing, persona (additive)

Date: 2026-10-11 02:00 IST. Lane: BE-2. Migration `20261011120000_dashboard_data.sql`.

## `packages/shared` (additive)

- `ClassProgressRow` gains four fields:
  - `weeks_played` and `news_editions`: `class_progress` has returned them since
    `20261010234500_map_news_events.sql`, but the type never listed them;
  - `persona: string | null`: the latest `persona_selected`, reading `persona_id`, else `personaId`;
  - `classroom_best: number | null`: the best classroom quiz score (0–100).
- New `ClassroomQuizSummaryRow`: `question_id`, `pillar`, `attempts`, `students`, `correct_pct`,
  `top_wrong_choice` (API.md 5.2).
- New `ClassWellbeingRow`: `anon_id`, `nickname`, `necessity_purchases`, `want_purchases`,
  `want_spend`, `work_shifts`, `school_days`.

Nothing was renamed or removed.

## Backend (facilitator only, security invoker: RLS decides, another class returns no rows)

- `classroom_quiz_summary(class_id)`: one row per classroom question the class answered, ordered by
  pillar. Every round counts in `attempts`. Baseline and end-line answers stay out.
  `top_wrong_choice` is in content order (as `QuizAnswer.choice` stores it); ties go to the lowest
  index; null if nobody got the question wrong.
- `class_wellbeing(class_id)`: one row per student, zeros for students with no life events.
  Purchases whose `kind` is not `necessity`/`want`, or whose `price` is not a whole number, are
  skipped. `work_shifts` and `school_days` count distinct weeks (the game allows one per week, so a
  re-sent action counts once); an event without month and week counts once on its own.
- `class_progress` gains `persona` and `classroom_best`, appended after `news_editions`. It was
  dropped and recreated, and its grants were set again.

## `@paisa/api-client`

- `classroomQuizSummary(classId)` (turns `correct_pct` into a number) and `classWellbeing(classId)`.

## Hosted auth URLs (`supabase/config.toml`)

`[remotes.production.auth]` now sets `site_url` and `additional_redirect_urls` from
`env(DASHBOARD_URL)`, so sign-in and invite emails link to the deployed dashboard. Set
`DASHBOARD_URL` in `.env` before `config push`: if it is unset, the CLI only warns and would push
the literal text as the site URL.

## For BE-1 (demo seed)

The demo class has no classroom quiz rounds and no life events, so `classroom_quiz_summary` and
`class_wellbeing` return nothing for it and `classroom_best` is null. The persona column works,
because the seed already sends `persona_selected` with `personaId`.
