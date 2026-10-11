-- Decisions per card, not per week. The decision loop pins 2-4 cards a week, but class_progress
-- (20261011120000_dashboard_data.sql) kept one decision_made per student per month + week, so
-- `decisions` and `pillars` showed only the last card of each week.
--
-- A decision's slot is now month + week + scenarioId: a card re-made after a rewind still replaces
-- the old choice, and a rewind_used (which names its scenarioId) hides only that card's decision
-- when it is not older. An event without month and week still counts on its own, as before.
-- Nothing else changes; the return type is the same, so create or replace keeps the grants.

create or replace function public.class_progress(class_id uuid)
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
                then (e.payload ->> 'month') || '.' || (e.payload ->> 'week') end as slot,
           -- A decision's slot is its week and its card: a week has 2-4 pinned cards.
           case when jsonb_typeof(e.payload -> 'month') = 'number' and jsonb_typeof(e.payload -> 'week') = 'number'
                then (e.payload ->> 'month') || '.' || (e.payload ->> 'week') || '.' || coalesce(e.payload ->> 'scenarioId', '')
           end as card_slot
    from public.events e
    where e.class_id = class_progress.class_id
  ),
  latest_decision as (
    select distinct on (d.anon_id, coalesce(d.card_slot, d.event_id::text))
           d.anon_id, d.card_slot, d.payload ->> 'pillar' as pillar, d.client_ts
    from ev d
    where d.type = 'decision_made'
    order by d.anon_id, coalesce(d.card_slot, d.event_id::text), d.client_ts desc, d.received_at desc
  ),
  kept as (
    select ld.anon_id, ld.pillar
    from latest_decision ld
    where ld.card_slot is null
       or not exists (
         select 1 from ev r
         where r.type = 'rewind_used' and r.anon_id = ld.anon_id and r.card_slot = ld.card_slot and r.client_ts >= ld.client_ts
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
