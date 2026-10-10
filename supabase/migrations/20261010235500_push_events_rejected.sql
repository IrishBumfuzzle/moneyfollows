-- push_events also says which events it skipped, so one bad event no longer costs the batch.
--
-- Before this, push_events returned only { accepted }. When accepted < batch size the client
-- could not tell which events were refused, so the sync queue dead-lettered the whole batch,
-- good events too. Now (additive):
--   * the result is { accepted, rejected }: rejected lists the event_id (as sent) of every
--     skipped event, so accepted + rejected = batch size, except for array items that are
--     not objects or have no event_id string, which have no id to report;
--   * each event is stored in its own subtransaction, so a constraint the earlier checks
--     missed (an integrity error) rejects that one event instead of failing the whole call.
-- Validation is otherwise unchanged from 20261010230000_classroom_quiz_events.sql.
-- create or replace keeps the existing grants (anon, authenticated).

-- ---------------------------------------------------------------------------
-- push_events(events) -> { accepted, rejected }   (5.5)
-- Idempotent on event_id: a retried batch inserts nothing new but still counts as
-- accepted. Skipped, not counted and listed in rejected: events for unknown students
-- or the wrong class, unknown types, bad ids or timestamps, payloads over 2 KB (4 KB
-- for quiz_submitted), malformed quiz_submitted payloads and ids another student
-- already holds. At most 500 per call.
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
  sent_id text;
  ev_id uuid;
  ev_anon uuid;
  ev_class uuid;
  ev_type text;
  ev_ts timestamptz;
  allowed text[];
  raw jsonb;
  clean jsonb;
  ok boolean;
  accepted int := 0;
  rejected jsonb := '[]'::jsonb;
begin
  if events is null or jsonb_typeof(events) <> 'array' then
    raise exception using errcode = 'PT400', message = 'events_must_be_an_array';
  end if;
  if jsonb_array_length(events) > 500 then
    raise exception using errcode = 'PT413', message = 'too_many_events';
  end if;

  for e in select value from jsonb_array_elements(events) loop
    if jsonb_typeof(e) <> 'object' then
      continue; -- nothing to report it by
    end if;
    sent_id := case when jsonb_typeof(e -> 'event_id') = 'string' then left(e ->> 'event_id', 64) end;
    ok := false;

    <<one>>
    begin
      begin
        ev_id := (e ->> 'event_id')::uuid;
        ev_anon := (e ->> 'anon_id')::uuid;
        ev_class := (e ->> 'class_id')::uuid;
        ev_type := e ->> 'type';
        ev_ts := (e ->> 'client_ts')::timestamptz;
      exception when others then
        exit one; -- malformed id or timestamp
      end;
      if ev_id is null or ev_anon is null or ev_class is null or ev_ts is null or ev_type is null then
        exit one;
      end if;
      -- A device clock in the future must not pin last_active.
      ev_ts := least(ev_ts, now() + interval '5 minutes');

      allowed := public.event_payload_keys(ev_type);
      if allowed is null then
        exit one; -- unknown event type
      end if;
      raw := coalesce(e -> 'payload', '{}'::jsonb);
      if jsonb_typeof(raw) <> 'object' then
        exit one;
      end if;
      if octet_length(raw::text) > (case when ev_type = 'quiz_submitted' then 4096 else 2048 end) then
        exit one;
      end if;
      select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) into clean
        from jsonb_each(raw) k
       where k.key = any (allowed)
         and (jsonb_typeof(k.value) in ('number', 'boolean')
              or (jsonb_typeof(k.value) = 'string' and (k.value #>> '{}') ~ '^[A-Za-z0-9_.:-]{1,64}$')
              or (ev_type = 'quiz_submitted' and k.key = 'answers'));
      if ev_type = 'quiz_submitted' then
        if not public.quiz_payload_ok(clean) then
          exit one;
        end if;
        -- Keep only the QuizAnswer fields, in order.
        clean := jsonb_set(clean, '{answers}', (
          select jsonb_agg(jsonb_build_object(
                   'questionId', a -> 'questionId', 'pillar', a -> 'pillar', 'choice', a -> 'choice', 'correct', a -> 'correct'
                 ) order by i)
            from jsonb_array_elements(clean -> 'answers') with ordinality as t(a, i)));
      end if;

      if not exists (select 1 from public.students s where s.anon_id = ev_anon and s.class_id = ev_class) then
        exit one;
      end if;

      -- One subtransaction per event: an integrity error undoes only this event's writes.
      begin
        insert into public.events (event_id, anon_id, class_id, type, payload, client_ts, content_version)
        values (ev_id, ev_anon, ev_class, ev_type, clean, ev_ts, left(e ->> 'content_version', 64))
        on conflict (event_id) do nothing;

        if not found then
          -- Already held: accepted only if it is the same student's event.
          ok := exists (select 1 from public.events x where x.event_id = ev_id and x.anon_id = ev_anon);
          exit one;
        end if;

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
        ok := true;
      exception when integrity_constraint_violation then
        ok := false; -- e.g. a type with payload keys but missing from the events CHECK
      end;
    end;

    if ok then
      accepted := accepted + 1;
    elsif sent_id is not null then
      rejected := rejected || jsonb_build_array(sent_id);
    end if;
  end loop;

  return json_build_object('accepted', accepted, 'rejected', rejected);
end;
$$;
