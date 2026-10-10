-- Classroom quiz results (apps/student School quiz) sync without being dropped.
--
-- Before this, quiz_submitted with quiz_type 'classroom' failed quiz_payload_ok, so push_events
-- skipped it and returned accepted < batch size; the client sync queue then dead-lettered the
-- whole batch on every flush. Now:
--   * quiz_payload_ok accepts 'classroom' (same answer and score rules);
--   * event_payload_keys keeps the optional quiz_id key;
--   * push_events records a quiz_attempts row only for baseline and endline, so learning_gain
--     and the one-attempt-per-type rule are unchanged, and quiz_attempts' CHECK never fires.
-- The init migration is already applied to the hosted project, so these functions are
-- redefined here instead of edited in place. create or replace keeps the existing grants.

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
  end
$$;

-- quiz_submitted payload: { quiz_type, quiz_id?, score 0-100, answers: 1-24 x { questionId, pillar, choice, correct } }.
-- quiz_type 'classroom' is the practice quiz at School: stored as an event, never as a quiz attempt.
create or replace function public.quiz_payload_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p ->> 'quiz_type' is null or p ->> 'quiz_type' not in ('baseline', 'endline', 'classroom') then
    return false;
  end if;
  if jsonb_typeof(p -> 'score') is distinct from 'number' or (p ->> 'score') !~ '^\d{1,3}$' then
    return false;
  end if;
  if (p ->> 'score')::int > 100 then
    return false;
  end if;
  if jsonb_typeof(p -> 'answers') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p -> 'answers') not between 1 and 24 then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_array_elements(p -> 'answers') a
    where jsonb_typeof(a) <> 'object'
       or jsonb_typeof(a -> 'correct') is distinct from 'boolean'
       or jsonb_typeof(a -> 'choice') is distinct from 'number'
       or jsonb_typeof(a -> 'questionId') is distinct from 'string'
       or coalesce(char_length(a ->> 'questionId'), 0) not between 1 and 64
       or coalesce(a ->> 'pillar', '') not in ('plan_budget', 'save_manage', 'understand_investing', 'stay_safe')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- push_events(events) -> { accepted }   (5.5)
-- Idempotent on event_id: a retried batch inserts nothing new but still counts as
-- accepted. Skipped, and not counted: events for unknown students or the wrong
-- class, unknown types, bad ids or timestamps, payloads over 2 KB (4 KB for
-- quiz_submitted) and malformed quiz_submitted payloads. At most 500 per call.
-- A student's second baseline (or end-line) is stored as an event but adds no
-- quiz attempt: the first attempt counts.
-- ---------------------------------------------------------------------------
create or replace function public.push_events(events jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e jsonb;
  ev_id uuid;
  ev_anon uuid;
  ev_class uuid;
  ev_type text;
  ev_ts timestamptz;
  allowed text[];
  raw jsonb;
  clean jsonb;
  inserted boolean;
  accepted int := 0;
begin
  if events is null or jsonb_typeof(events) <> 'array' then
    raise exception using errcode = 'PT400', message = 'events_must_be_an_array';
  end if;
  if jsonb_array_length(events) > 500 then
    raise exception using errcode = 'PT413', message = 'too_many_events';
  end if;

  for e in select value from jsonb_array_elements(events) loop
    if jsonb_typeof(e) <> 'object' then
      continue;
    end if;
    begin
      ev_id := (e ->> 'event_id')::uuid;
      ev_anon := (e ->> 'anon_id')::uuid;
      ev_class := (e ->> 'class_id')::uuid;
      ev_type := e ->> 'type';
      ev_ts := (e ->> 'client_ts')::timestamptz;
    exception when others then
      continue; -- malformed id or timestamp
    end;
    if ev_id is null or ev_anon is null or ev_class is null or ev_ts is null or ev_type is null then
      continue;
    end if;
    -- A device clock in the future must not pin last_active.
    ev_ts := least(ev_ts, now() + interval '5 minutes');

    allowed := public.event_payload_keys(ev_type);
    if allowed is null then
      continue; -- unknown event type
    end if;
    raw := coalesce(e -> 'payload', '{}'::jsonb);
    if jsonb_typeof(raw) <> 'object' then
      continue;
    end if;
    if octet_length(raw::text) > (case when ev_type = 'quiz_submitted' then 4096 else 2048 end) then
      continue;
    end if;
    select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) into clean
      from jsonb_each(raw) k
     where k.key = any (allowed)
       and (jsonb_typeof(k.value) in ('number', 'boolean')
            or (jsonb_typeof(k.value) = 'string' and (k.value #>> '{}') ~ '^[A-Za-z0-9_.:-]{1,64}$')
            or (ev_type = 'quiz_submitted' and k.key = 'answers'));
    if ev_type = 'quiz_submitted' then
      if not public.quiz_payload_ok(clean) then
        continue;
      end if;
      -- Keep only the QuizAnswer fields, in order.
      clean := jsonb_set(clean, '{answers}', (
        select jsonb_agg(jsonb_build_object(
                 'questionId', a -> 'questionId', 'pillar', a -> 'pillar', 'choice', a -> 'choice', 'correct', a -> 'correct'
               ) order by i)
          from jsonb_array_elements(clean -> 'answers') with ordinality as t(a, i)));
    end if;

    if not exists (select 1 from public.students s where s.anon_id = ev_anon and s.class_id = ev_class) then
      continue;
    end if;

    insert into public.events (event_id, anon_id, class_id, type, payload, client_ts, content_version)
    values (ev_id, ev_anon, ev_class, ev_type, clean, ev_ts, left(e ->> 'content_version', 64))
    on conflict (event_id) do nothing;
    inserted := found;

    if not inserted then
      -- Already held: accepted only if it is the same student's event.
      if exists (select 1 from public.events x where x.event_id = ev_id and x.anon_id = ev_anon) then
        accepted := accepted + 1;
      end if;
      continue;
    end if;
    accepted := accepted + 1;

    update public.students s
      set last_active = greatest(coalesce(s.last_active, ev_ts), ev_ts)
      where s.anon_id = ev_anon;

    if ev_type = 'quiz_submitted' and clean ->> 'quiz_type' in ('baseline', 'endline') then
      -- Only baseline/end-line tests feed learning_gain; classroom practice stays an event.
      -- created_at defaults to the server's now(); a later attempt of the same type is ignored.
      insert into public.quiz_attempts (anon_id, quiz_type, answers, score, event_id)
      values (ev_anon, clean ->> 'quiz_type', clean -> 'answers', (clean ->> 'score')::int, ev_id)
      on conflict do nothing;
    elsif ev_type = 'language_changed' and clean ->> 'lang' in ('en', 'hi', 'te', 'ur') then
      update public.students s set lang = clean ->> 'lang' where s.anon_id = ev_anon;
    elsif ev_type in ('onboarding_complete', 'persona_selected')
      and clean ->> 'level' in ('starter', 'explorer', 'planner') then
      update public.students s set level = clean ->> 'level' where s.anon_id = ev_anon;
    end if;
  end loop;

  return json_build_object('accepted', accepted);
end;
$$;
