-- Paisa Path MVP schema (CLAUDE.md 5.5, 5.6, 7.5).
-- Students never get accounts: they reach the database only through the
-- security-definer functions join_class and push_events. Facilitators sign in
-- with Supabase Auth and see only their own classes through row-level security.
-- No real names, phone numbers, birth dates, addresses or bank data anywhere.

-- ---------------------------------------------------------------------------
-- Class codes: 6 characters without look-alikes (no 0/O, 1/I/L).
-- ---------------------------------------------------------------------------
create or replace function public.gen_class_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes c where c.class_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables (5.6)
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  class_code text not null unique,
  default_lang text not null default 'hi' check (default_lang in ('en', 'hi', 'te', 'ur')),
  facilitator_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
-- Set after the table exists, because the function reads it.
alter table public.classes alter column class_code set default public.gen_class_code();
create index classes_facilitator_idx on public.classes (facilitator_id);

create table public.students (
  anon_id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  nickname text not null,
  lang text not null check (lang in ('en', 'hi', 'te', 'ur')),
  level text not null default 'starter' check (level in ('starter', 'explorer', 'planner')),
  created_at timestamptz not null default now(),
  -- Additive: latest event time, for the progress table's inactive flag.
  last_active timestamptz
);
create unique index students_class_nickname_uq on public.students (class_id, lower(nickname));

create table public.events (
  event_id uuid primary key,
  anon_id uuid not null references public.students (anon_id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  type text not null check (type in (
    'app_open', 'onboarding_complete', 'persona_selected', 'decision_made', 'rewind_used', 'event_triggered',
    'minigame_complete', 'quiz_submitted', 'module_complete', 'badge_earned', 'language_changed', 'sync_complete'
  )),
  payload jsonb not null default '{}'::jsonb,
  client_ts timestamptz not null,
  -- Additive: from SyncEvent, plus when the server received it.
  content_version text,
  received_at timestamptz not null default now()
);
create index events_class_type_idx on public.events (class_id, type);
create index events_anon_idx on public.events (anon_id, client_ts);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  anon_id uuid not null references public.students (anon_id) on delete cascade,
  quiz_type text not null check (quiz_type in ('baseline', 'endline')),
  -- QuizAnswer[]: [{ questionId, pillar, choice, correct }]
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  score int not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  -- Additive: the quiz_submitted event this came from, so a re-sent batch adds no duplicate.
  event_id uuid unique references public.events (event_id) on delete cascade
);
create index quiz_attempts_anon_idx on public.quiz_attempts (anon_id, quiz_type, created_at);

-- Nickname word filter (7.5). Readable only by the definer functions.
create table public.blocked_words (word text primary key);
insert into public.blocked_words (word) values
  ('fuck'), ('shit'), ('bitch'), ('bastard'), ('dick'), ('cunt'), ('slut'), ('whore'), ('sex'), ('porn'),
  ('nude'), ('rape'), ('nazi'), ('idiot'), ('stupid'),
  ('chutiya'), ('madarchod'), ('behenchod'), ('bhenchod'), ('gandu'), ('randi'), ('harami'), ('kutta'), ('kutiya'),
  ('saala'), ('chod'), ('लौड़ा'), ('चूतिया'), ('मादरचोद'), ('बहनचोद'), ('गांडू'), ('रंडी'), ('हरामी'), ('कुत्ता'), ('कुतिया');

-- ---------------------------------------------------------------------------
-- Row-level security: facilitators see only their own classes (5.6).
-- ---------------------------------------------------------------------------
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.events enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.blocked_words enable row level security;

create or replace function public.my_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.classes c where c.facilitator_id = auth.uid()
$$;

create policy classes_own on public.classes
  for all to authenticated
  using (facilitator_id = auth.uid())
  with check (facilitator_id = auth.uid());

create policy students_in_my_classes on public.students
  for select to authenticated
  using (class_id in (select public.my_class_ids()));
-- A facilitator may rename a student (e.g. an unkind nickname) or remove one.
create policy students_rename on public.students
  for update to authenticated
  using (class_id in (select public.my_class_ids()))
  with check (class_id in (select public.my_class_ids()));
create policy students_remove on public.students
  for delete to authenticated
  using (class_id in (select public.my_class_ids()));

create policy events_in_my_classes on public.events
  for select to authenticated
  using (class_id in (select public.my_class_ids()));

create policy quiz_attempts_in_my_classes on public.quiz_attempts
  for select to authenticated
  using (anon_id in (select s.anon_id from public.students s where s.class_id in (select public.my_class_ids())));

-- Explicit privileges: students (anon) touch no table directly.
revoke all on public.classes, public.students, public.events, public.quiz_attempts, public.blocked_words from anon, authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, delete on public.students to authenticated;
grant update (nickname) on public.students to authenticated;
grant select on public.events, public.quiz_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- join_class(class_code, nickname) -> { anon_id, class_id, default_lang }   (5.5)
-- Errors use PostgREST's PTxxx codes, so the HTTP status matches.
-- ---------------------------------------------------------------------------
create or replace function public.nickname_problem(nick text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  squashed text;
begin
  if nick is null then
    return 'nickname_invalid';
  end if;
  -- No phone numbers or emails in a nickname.
  if regexp_replace(nick, '[\s.-]', '', 'g') ~ '\d{5,}' or position('@' in nick) > 0 then
    return 'nickname_personal_info';
  end if;
  if char_length(nick) < 2 or char_length(nick) > 20 or nick !~ '^[[:alnum:] _.-]+$' then
    return 'nickname_invalid';
  end if;
  squashed := translate(lower(regexp_replace(nick, '[\s_.-]', '', 'g')), '013457@$!', 'oieastasi');
  if exists (select 1 from public.blocked_words b where position(b.word in squashed) > 0) then
    return 'nickname_blocked';
  end if;
  return null;
end;
$$;

create or replace function public.join_class(class_code text, nickname text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cls public.classes%rowtype;
  nick text := btrim(nickname);
  problem text;
  new_id uuid;
begin
  select * into cls from public.classes c where c.class_code = upper(btrim(join_class.class_code));
  if not found then
    raise exception using errcode = 'PT404', message = 'class_not_found';
  end if;

  problem := public.nickname_problem(nick);
  if problem is not null then
    raise exception using errcode = 'PT422', message = problem;
  end if;

  begin
    insert into public.students (class_id, nickname, lang)
    values (cls.id, nick, cls.default_lang)
    returning anon_id into new_id;
  exception when unique_violation then
    raise exception using errcode = 'PT409', message = 'nickname_taken';
  end;

  return json_build_object('anon_id', new_id, 'class_id', cls.id, 'default_lang', cls.default_lang);
end;
$$;

-- ---------------------------------------------------------------------------
-- push_events(events) -> { accepted }   (5.5)
-- Idempotent on event_id: a retried batch inserts nothing new but still counts as
-- accepted. Events for unknown students, the wrong class or with a bad shape are skipped.
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
  inserted boolean;
  accepted int := 0;
  quiz jsonb;
begin
  if events is null or jsonb_typeof(events) <> 'array' then
    raise exception using errcode = 'PT400', message = 'events_must_be_an_array';
  end if;
  if jsonb_array_length(events) > 500 then
    raise exception using errcode = 'PT413', message = 'too_many_events';
  end if;

  for e in select value from jsonb_array_elements(events) loop
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
    if e ? 'payload' and jsonb_typeof(e -> 'payload') <> 'object' then
      continue;
    end if;
    if not exists (select 1 from public.students s where s.anon_id = ev_anon and s.class_id = ev_class) then
      continue;
    end if;

    begin
      insert into public.events (event_id, anon_id, class_id, type, payload, client_ts, content_version)
      values (ev_id, ev_anon, ev_class, ev_type, coalesce(e -> 'payload', '{}'::jsonb), ev_ts, e ->> 'content_version')
      on conflict (event_id) do nothing;
      inserted := found;
    exception when check_violation then
      continue; -- unknown event type
    end;

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

    if ev_type = 'quiz_submitted' then
      quiz := e -> 'payload';
      if quiz ->> 'quiz_type' in ('baseline', 'endline')
        and jsonb_typeof(quiz -> 'answers') = 'array'
        and (quiz ->> 'score') ~ '^\d{1,3}$' and (quiz ->> 'score')::int between 0 and 100 then
        insert into public.quiz_attempts (anon_id, quiz_type, answers, score, created_at, event_id)
        values (ev_anon, quiz ->> 'quiz_type', quiz -> 'answers', (quiz ->> 'score')::int, ev_ts, ev_id)
        on conflict (event_id) do nothing;
      end if;
    elsif ev_type = 'language_changed' and e -> 'payload' ->> 'lang' in ('en', 'hi', 'te', 'ur') then
      update public.students s set lang = e -> 'payload' ->> 'lang' where s.anon_id = ev_anon;
    elsif ev_type in ('onboarding_complete', 'persona_selected')
      and e -> 'payload' ->> 'level' in ('starter', 'explorer', 'planner') then
      update public.students s set level = e -> 'payload' ->> 'level' where s.anon_id = ev_anon;
    end if;
  end loop;

  return json_build_object('accepted', accepted);
end;
$$;

-- ---------------------------------------------------------------------------
-- class_progress(class_id) -> one row per student   (5.5, facilitator only via RLS)
-- security invoker: the caller's RLS decides what is visible, so another
-- facilitator's class simply returns no rows.
-- ---------------------------------------------------------------------------
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
  endline_score int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.anon_id,
    s.nickname,
    (select count(distinct ev.payload ->> 'pillar')::int
       from public.events ev
      where ev.anon_id = s.anon_id and ev.type = 'module_complete' and ev.payload ? 'pillar'),
    greatest(s.last_active, (select max(ev.client_ts) from public.events ev where ev.anon_id = s.anon_id)),
    s.lang,
    (select count(*)::int from public.events ev where ev.anon_id = s.anon_id and ev.type = 'decision_made'),
    jsonb_build_object(
      'plan_budget', (select count(*) from public.events ev where ev.anon_id = s.anon_id and ev.type = 'decision_made' and ev.payload ->> 'pillar' = 'plan_budget'),
      'save_manage', (select count(*) from public.events ev where ev.anon_id = s.anon_id and ev.type = 'decision_made' and ev.payload ->> 'pillar' = 'save_manage'),
      'understand_investing', (select count(*) from public.events ev where ev.anon_id = s.anon_id and ev.type = 'decision_made' and ev.payload ->> 'pillar' = 'understand_investing'),
      'stay_safe', (select count(*) from public.events ev where ev.anon_id = s.anon_id and ev.type = 'decision_made' and ev.payload ->> 'pillar' = 'stay_safe')
    ),
    (select q.score from public.quiz_attempts q where q.anon_id = s.anon_id and q.quiz_type = 'baseline' order by q.created_at desc limit 1),
    (select q.score from public.quiz_attempts q where q.anon_id = s.anon_id and q.quiz_type = 'endline' order by q.created_at desc limit 1)
  from public.students s
  where s.class_id = class_progress.class_id
  order by lower(s.nickname)
$$;

-- ---------------------------------------------------------------------------
-- learning_gain(class_id) -> baseline vs end-line percent correct by pillar   (5.5)
-- Uses each student's latest attempt of each quiz type.
-- ---------------------------------------------------------------------------
create or replace function public.learning_gain(class_id uuid)
returns table (pillar text, baseline_avg numeric, endline_avg numeric, baseline_n int, endline_n int)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (q.anon_id, q.quiz_type) q.anon_id, q.quiz_type, q.answers
    from public.quiz_attempts q
    join public.students s on s.anon_id = q.anon_id
    where s.class_id = learning_gain.class_id
    order by q.anon_id, q.quiz_type, q.created_at desc
  ),
  per_student as (
    select l.anon_id, l.quiz_type, a ->> 'pillar' as pillar,
           100.0 * avg(case when (a ->> 'correct')::boolean then 1 else 0 end) as pct
    from latest l, jsonb_array_elements(l.answers) a
    group by l.anon_id, l.quiz_type, a ->> 'pillar'
  ),
  pillars(pillar, ord) as (
    values ('plan_budget', 1), ('save_manage', 2), ('understand_investing', 3), ('stay_safe', 4)
  )
  select
    p.pillar,
    round(avg(ps.pct) filter (where ps.quiz_type = 'baseline'), 1),
    round(avg(ps.pct) filter (where ps.quiz_type = 'endline'), 1),
    (count(ps.anon_id) filter (where ps.quiz_type = 'baseline'))::int,
    (count(ps.anon_id) filter (where ps.quiz_type = 'endline'))::int
  from pillars p
  left join per_student ps on ps.pillar = p.pillar
  group by p.pillar, p.ord
  order by p.ord
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.join_class(text, text) to anon, authenticated;
grant execute on function public.push_events(jsonb) to anon, authenticated;
grant execute on function public.class_progress(uuid) to authenticated;
grant execute on function public.learning_gain(uuid) to authenticated;
grant execute on function public.gen_class_code() to authenticated;
grant execute on function public.my_class_ids() to authenticated;
