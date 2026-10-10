-- Daily life events: the game now runs day by day (a day count; school, then work, at most once
-- each a day; resting at home ends the day). Three changes:
--
--   * day_rested: a new event type, sent each night the student rests at home:
--     { month, week, day, health, sanity } (day = the day that ended; health and sanity are the
--     clamped changes). week_slept is still sent when a week ends.
--   * shop_purchase, work_shift and school_attended also keep `day` (1-7). Older clients that
--     send no day keep working: their events are still accepted.
--   * class_wellbeing counts work shifts and school days per day when the event has a day (one
--     of each a day, so a re-sent action counts once), per week for older events without one,
--     and gains rest_days (distinct days rested). Its return type changes, so it is dropped and
--     recreated from 20261011120000_dashboard_data.sql, and its grants are set again.
--
-- As before, the type CHECK and event_payload_keys change together (see
-- 20261011090000_life_events_persona.sql).

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'app_open', 'onboarding_complete', 'persona_selected', 'decision_made', 'rewind_used', 'event_triggered',
  'minigame_complete', 'quiz_submitted', 'module_complete', 'badge_earned', 'language_changed', 'sync_complete',
  'map_opened', 'location_selected', 'week_slept', 'glossary_term_opened', 'news_question_answered',
  'news_edition_completed', 'shop_purchase', 'work_shift', 'school_attended', 'day_rested'
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
    -- personaId (older clients) and persona_id (onboarding) are both kept.
    when 'onboarding_complete' then array['level', 'lang', 'personaId', 'persona_id']
    when 'persona_selected' then array['personaId', 'persona_id', 'level']
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
    -- Life meters: health and sanity are the clamped changes; price and wage whole rupees;
    -- day (1-7) is the day of the week it happened.
    when 'shop_purchase' then array['kind', 'price', 'health', 'sanity', 'month', 'week', 'day']
    when 'work_shift' then array['wage', 'health', 'sanity', 'month', 'week', 'day']
    when 'school_attended' then array['health', 'sanity', 'month', 'week', 'day']
    when 'day_rested' then array['month', 'week', 'day', 'health', 'sanity']
  end
$$;

-- ---------------------------------------------------------------------------
-- class_wellbeing(class_id) -> one row per student
--   necessity_purchases, want_purchases  shop_purchase events by kind
--   want_spend                           rupees spent on wants (sum of price)
--   work_shifts, school_days             distinct days (payload month + week + day) with a shift
--                                        or a school day; the game allows one of each a day, so
--                                        a re-sent action counts once. An older event with a week
--                                        but no day counts once per week; one with neither counts
--                                        once.
--   rest_days                            distinct days rested at home (day_rested), same rule
-- A purchase whose kind is not necessity or want, or whose price is not a whole number of
-- rupees, is skipped.
-- ---------------------------------------------------------------------------
drop function public.class_wellbeing(uuid);

create function public.class_wellbeing(class_id uuid)
returns table (
  anon_id uuid,
  nickname text,
  necessity_purchases int,
  want_purchases int,
  want_spend int,
  work_shifts int,
  school_days int,
  rest_days int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ev as (
    select e.anon_id, e.event_id, e.type, e.payload,
           case when jsonb_typeof(e.payload -> 'month') = 'number' and jsonb_typeof(e.payload -> 'week') = 'number'
                then (e.payload ->> 'month') || '.' || (e.payload ->> 'week')
                     || case when jsonb_typeof(e.payload -> 'day') = 'number' then '.' || (e.payload ->> 'day') else '' end
           end as slot
    from public.events e
    where e.class_id = class_wellbeing.class_id
      and e.type in ('shop_purchase', 'work_shift', 'school_attended', 'day_rested')
  ),
  purchase as (
    select p.anon_id, p.payload ->> 'kind' as kind, (p.payload ->> 'price')::int as price
    from ev p
    where p.type = 'shop_purchase'
      and p.payload ->> 'kind' in ('necessity', 'want')
      and jsonb_typeof(p.payload -> 'price') = 'number'
      and (p.payload ->> 'price') ~ '^\d{1,9}$'
  )
  select
    s.anon_id,
    s.nickname,
    (select count(*)::int from purchase p where p.anon_id = s.anon_id and p.kind = 'necessity'),
    (select count(*)::int from purchase p where p.anon_id = s.anon_id and p.kind = 'want'),
    (select coalesce(sum(p.price), 0)::int from purchase p where p.anon_id = s.anon_id and p.kind = 'want'),
    (select count(distinct coalesce(w.slot, w.event_id::text))::int
       from ev w
      where w.anon_id = s.anon_id and w.type = 'work_shift'),
    (select count(distinct coalesce(d.slot, d.event_id::text))::int
       from ev d
      where d.anon_id = s.anon_id and d.type = 'school_attended'),
    (select count(distinct coalesce(r.slot, r.event_id::text))::int
       from ev r
      where r.anon_id = s.anon_id and r.type = 'day_rested')
  from public.students s
  where s.class_id = class_wellbeing.class_id
  order by lower(s.nickname)
$$;

-- Facilitators only (security invoker: RLS decides which classes they see).
revoke execute on function public.class_wellbeing(uuid) from public, anon, authenticated;
grant execute on function public.class_wellbeing(uuid) to authenticated;
