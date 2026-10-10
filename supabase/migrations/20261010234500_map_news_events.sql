-- Map and Paisa Times sync events (CLAUDE.md 5.5): map_opened, location_selected, week_slept,
-- glossary_term_opened, news_question_answered and news_edition_completed.
--
-- The type CHECK and the payload keys change together: with keys but no CHECK, push_events
-- would insert a type the table refuses, and the raise would fail the whole batch.
-- Payload keys are exactly the 5.5 ones (snake_case); values pass push_events' usual filter
-- (numbers, booleans, short id-like strings), so edition "2026-W41" and sub-map ids like
-- "convenience.phone_shop" are kept.
--
-- class_progress gains two additive columns at the end:
--   weeks_played   distinct (month, week) slots the student slept through (week_slept);
--   news_editions  distinct Paisa Times editions completed (news_edition_completed).
-- Its return type changes, so it is dropped and recreated (create or replace cannot add
-- columns), and its grants are set again.

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'app_open', 'onboarding_complete', 'persona_selected', 'decision_made', 'rewind_used', 'event_triggered',
  'minigame_complete', 'quiz_submitted', 'module_complete', 'badge_earned', 'language_changed', 'sync_complete',
  'map_opened', 'location_selected', 'week_slept', 'glossary_term_opened', 'news_question_answered',
  'news_edition_completed'
));

create or replace function public.event_payload_keys(ev_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case ev_type
    when 'app_open' then array[]::text[]
    when 'sync_complete' then array['count']
    when 'onboarding_complete' then array['level', 'lang']
    when 'persona_selected' then array['personaId', 'level']
    -- month and week identify the weekly slot, so a re-made (rewound) decision replaces the old one.
    when 'decision_made' then array['scenarioId', 'choiceId', 'pillar', 'month', 'week']
    -- month and week of the decision that was undone.
    when 'rewind_used' then array['scenarioId', 'month', 'week', 'tokensLeft']
    when 'event_triggered' then array['eventId', 'choiceId', 'month', 'week']
    when 'minigame_complete' then array['game', 'correct', 'total', 'score', 'level']
    when 'quiz_submitted' then array['quiz_type', 'quiz_id', 'answers', 'score']
    when 'module_complete' then array['moduleId', 'pillar']
    when 'badge_earned' then array['badgeId']
    when 'language_changed' then array['lang']
    when 'map_opened' then array[]::text[]
    -- A place id, or a sub-map location id such as convenience.phone_shop.
    when 'location_selected' then array['location_id']
    when 'week_slept' then array['month', 'week']
    when 'glossary_term_opened' then array['term_id', 'article_id']
    when 'news_question_answered' then array['edition', 'article_id', 'correct', 'attempt']
    when 'news_edition_completed' then array['edition', 'correct_count']
  end
$$;

drop function public.class_progress(uuid);

-- ---------------------------------------------------------------------------
-- class_progress(class_id) -> one row per student   (5.5, facilitator only via RLS)
-- security invoker: the caller's RLS decides what is visible, so another
-- facilitator's class simply returns no rows.
-- Client events are not taken at face value:
--   modules_done  distinct modules (payload moduleId, else pillar) from module_complete;
--   decisions     one per weekly slot (payload month + week): a re-made decision
--                 replaces the earlier one, and a rewind_used for that slot after the
--                 latest decision removes it. Decisions without a slot count once each;
--   last_active   device times capped at 5 minutes after the server received them;
--   weeks_played  distinct month + week slots from week_slept (a re-sent sleep counts once);
--   news_editions distinct editions from news_edition_completed.
-- ---------------------------------------------------------------------------
create function public.class_progress(class_id uuid)
returns table (
  anon_id uuid,
  nickname text,
  modules_done int,
  last_active timestamptz,
  lang text,
  decisions int,
  pillars jsonb,
  baseline_score int,
  endline_score int,
  weeks_played int,
  news_editions int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ev as (
    select e.anon_id, e.event_id, e.type, e.payload, e.client_ts, e.received_at,
           case when jsonb_typeof(e.payload -> 'month') = 'number' and jsonb_typeof(e.payload -> 'week') = 'number'
                then (e.payload ->> 'month') || '.' || (e.payload ->> 'week') end as slot
    from public.events e
    where e.class_id = class_progress.class_id
  ),
  latest_decision as (
    select distinct on (d.anon_id, coalesce(d.slot, d.event_id::text))
           d.anon_id, d.slot, d.payload ->> 'pillar' as pillar, d.client_ts
    from ev d
    where d.type = 'decision_made'
    order by d.anon_id, coalesce(d.slot, d.event_id::text), d.client_ts desc, d.received_at desc
  ),
  kept as (
    select ld.anon_id, ld.pillar
    from latest_decision ld
    where ld.slot is null
       or not exists (
         select 1 from ev r
         where r.type = 'rewind_used' and r.anon_id = ld.anon_id and r.slot = ld.slot and r.client_ts >= ld.client_ts
       )
  )
  select
    s.anon_id,
    s.nickname,
    (select count(distinct coalesce(m.payload ->> 'moduleId', m.payload ->> 'pillar'))::int
       from ev m
      where m.anon_id = s.anon_id and m.type = 'module_complete'),
    greatest(s.last_active,
             (select max(least(x.client_ts, x.received_at + interval '5 minutes')) from ev x where x.anon_id = s.anon_id)),
    s.lang,
    (select count(*)::int from kept k where k.anon_id = s.anon_id),
    jsonb_build_object(
      'plan_budget', (select count(*) from kept k where k.anon_id = s.anon_id and k.pillar = 'plan_budget'),
      'save_manage', (select count(*) from kept k where k.anon_id = s.anon_id and k.pillar = 'save_manage'),
      'understand_investing', (select count(*) from kept k where k.anon_id = s.anon_id and k.pillar = 'understand_investing'),
      'stay_safe', (select count(*) from kept k where k.anon_id = s.anon_id and k.pillar = 'stay_safe')
    ),
    (select q.score from public.quiz_attempts q where q.anon_id = s.anon_id and q.quiz_type = 'baseline' order by q.created_at limit 1),
    (select q.score from public.quiz_attempts q where q.anon_id = s.anon_id and q.quiz_type = 'endline' order by q.created_at limit 1),
    (select count(distinct w.slot)::int from ev w where w.anon_id = s.anon_id and w.type = 'week_slept'),
    (select count(distinct n.payload ->> 'edition')::int
       from ev n
      where n.anon_id = s.anon_id and n.type = 'news_edition_completed' and jsonb_typeof(n.payload -> 'edition') = 'string')
  from public.students s
  where s.class_id = class_progress.class_id
  order by lower(s.nickname)
$$;

-- A new function is executable by public (and Supabase's default privileges add anon and
-- authenticated), so restore the init migration's grants: facilitators only.
revoke execute on function public.class_progress(uuid) from public, anon, authenticated;
grant execute on function public.class_progress(uuid) to authenticated;
