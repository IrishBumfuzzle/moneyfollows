-- Dashboard data: what the classroom quiz shows, how students spend in the life meters, and
-- two more class_progress columns. All facilitator-only and security invoker, so the caller's
-- RLS decides what is visible: another facilitator's class returns no rows.
--
--   * classroom_quiz_summary(class_id): one row per classroom question the class answered
--     (API.md 5.2), for "where is my class struggling". Practice rounds only; baseline and
--     end-line answers stay out.
--   * class_wellbeing(class_id): store purchases, want spending, work shifts and school days per
--     student, from the life events (docs/life-meters-api.md section 5 on main).
--   * class_progress gains persona and classroom_best, appended after news_editions. Its return
--     type changes, so it is dropped and recreated (create or replace cannot add columns) from
--     the definition in 20261010234500_map_news_events.sql, and its grants are set again.

-- ---------------------------------------------------------------------------
-- classroom_quiz_summary(class_id) -> one row per question   (API.md 5.2)
--   attempts          answers from the class; every round counts
--   students          distinct students who answered it
--   correct_pct       percent of those answers that were right, one decimal
--   top_wrong_choice  the wrong option picked most often (content order, as QuizAnswer.choice
--                     stores it); ties go to the lowest index; null if nobody got it wrong
-- ---------------------------------------------------------------------------
create function public.classroom_quiz_summary(class_id uuid)
returns table (
  question_id text,
  pillar text,
  attempts int,
  students int,
  correct_pct numeric,
  top_wrong_choice int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with answer as (
    select e.anon_id,
           a ->> 'questionId' as question_id,
           a ->> 'pillar' as pillar,
           coalesce(a -> 'correct' = 'true'::jsonb, false) as correct,
           case when (a ->> 'choice') ~ '^\d{1,3}$' then (a ->> 'choice')::int end as choice
    from public.events e
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(e.payload -> 'answers') = 'array' then e.payload -> 'answers' else '[]'::jsonb end
    ) a
    where e.class_id = classroom_quiz_summary.class_id
      and e.type = 'quiz_submitted'
      and e.payload ->> 'quiz_type' = 'classroom'
      and a ->> 'questionId' is not null
  )
  select
    a.question_id,
    a.pillar,
    count(*)::int,
    count(distinct a.anon_id)::int,
    round(100.0 * avg(case when a.correct then 1 else 0 end), 1),
    mode() within group (order by a.choice) filter (where not a.correct and a.choice is not null)
  from answer a
  group by a.question_id, a.pillar
  order by array_position(array['plan_budget', 'save_manage', 'understand_investing', 'stay_safe'], a.pillar),
           a.question_id
$$;

-- ---------------------------------------------------------------------------
-- class_wellbeing(class_id) -> one row per student
--   necessity_purchases, want_purchases  shop_purchase events by kind
--   want_spend                           rupees spent on wants (sum of price)
--   work_shifts, school_days             distinct weeks (payload month + week) with a shift or a
--                                        school day; the game allows one of each per week, so a
--                                        re-sent action counts once. Without a week, each event
--                                        counts once.
-- A purchase whose kind is not necessity or want, or whose price is not a whole number of
-- rupees, is skipped.
-- ---------------------------------------------------------------------------
create function public.class_wellbeing(class_id uuid)
returns table (
  anon_id uuid,
  nickname text,
  necessity_purchases int,
  want_purchases int,
  want_spend int,
  work_shifts int,
  school_days int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ev as (
    select e.anon_id, e.event_id, e.type, e.payload,
           case when jsonb_typeof(e.payload -> 'month') = 'number' and jsonb_typeof(e.payload -> 'week') = 'number'
                then (e.payload ->> 'month') || '.' || (e.payload ->> 'week') end as slot
    from public.events e
    where e.class_id = class_wellbeing.class_id
      and e.type in ('shop_purchase', 'work_shift', 'school_attended')
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
      where d.anon_id = s.anon_id and d.type = 'school_attended')
  from public.students s
  where s.class_id = class_wellbeing.class_id
  order by lower(s.nickname)
$$;

-- ---------------------------------------------------------------------------
-- class_progress(class_id) -> one row per student   (5.5, facilitator only via RLS)
-- Unchanged from 20261010234500_map_news_events.sql, plus two columns at the end:
--   persona         the latest persona_selected (by device time), reading persona_id (what
--                   onboarding sends), else personaId (older clients and the demo seed); null
--                   if none
--   classroom_best  the best classroom quiz score (0-100); null if the student has not
--                   finished a classroom round
-- ---------------------------------------------------------------------------
drop function public.class_progress(uuid);

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
  news_editions int,
  persona text,
  classroom_best int
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
      where n.anon_id = s.anon_id and n.type = 'news_edition_completed' and jsonb_typeof(n.payload -> 'edition') = 'string'),
    (select coalesce(p.payload ->> 'persona_id', p.payload ->> 'personaId')
       from ev p
      where p.anon_id = s.anon_id
        and p.type = 'persona_selected'
        and coalesce(p.payload ->> 'persona_id', p.payload ->> 'personaId') is not null
      order by p.client_ts desc, p.received_at desc
      limit 1),
    (select max((c.payload ->> 'score')::int)
       from ev c
      where c.anon_id = s.anon_id
        and c.type = 'quiz_submitted'
        and c.payload ->> 'quiz_type' = 'classroom'
        and (c.payload ->> 'score') ~ '^\d{1,3}$')
  from public.students s
  where s.class_id = class_progress.class_id
  order by lower(s.nickname)
$$;

-- New functions are executable by public (and Supabase's default privileges add anon and
-- authenticated), so set the grants explicitly: facilitators only.
revoke execute on function public.classroom_quiz_summary(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quiz_summary(uuid) to authenticated;
revoke execute on function public.class_wellbeing(uuid) from public, anon, authenticated;
grant execute on function public.class_wellbeing(uuid) to authenticated;
revoke execute on function public.class_progress(uuid) from public, anon, authenticated;
grant execute on function public.class_progress(uuid) to authenticated;
