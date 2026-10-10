-- MoneyFollows MVP schema (CLAUDE.md 5.5, 5.6, 7.5).
-- Students never get accounts: they reach the database only through the
-- security-definer functions join_class and push_events. Facilitators sign in
-- with Supabase Auth, must be on the staff allowlist, and see only their own
-- classes through row-level security.
-- No real names, phone numbers, birth dates, addresses or bank data anywhere.
--
-- TODO (out of scope for the MVP): a Vanguard reporting role that can read only
-- aggregate views (e.g. learning_gain across classes, no anon_id or nickname).
-- Until it exists, Vanguard gets exported aggregates, never table access.

-- pgcrypto lives in the `extensions` schema on Supabase (already installed there).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Class codes: 8 characters without look-alikes (no 0/O, 1/I/L), from a
-- cryptographic RNG. Rejection sampling keeps every character equally likely.
-- ---------------------------------------------------------------------------
create or replace function public.gen_class_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 characters
  code text;
  bytes bytea;
  b int;
begin
  loop
    code := '';
    while char_length(code) < 8 loop
      bytes := extensions.gen_random_bytes(16);
      for i in 0..15 loop
        b := get_byte(bytes, i);
        -- 248 = 31 * 8: bytes above it would bias the first characters.
        if b < 248 and char_length(code) < 8 then
          code := code || substr(alphabet, 1 + (b % 31), 1);
        end if;
      end loop;
    end loop;
    exit when not exists (select 1 from public.classes c where c.class_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff allowlist: only these emails act as facilitators. Not every
-- authenticated user is staff. Managed by the project owner (SQL editor or the
-- service role); no grants to anon or authenticated.
-- ---------------------------------------------------------------------------
create table public.staff (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  added_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tables (5.6)
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  -- 6-8 characters so the 6-character demo code still fits; new codes are 8.
  class_code text not null unique check (class_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,8}$'),
  default_lang text not null default 'hi' check (default_lang in ('en', 'hi', 'te', 'ur')),
  -- restrict, not cascade: deleting a facilitator's account must never wipe student
  -- data. Transfer the classes first (README, "Transferring a class").
  facilitator_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
-- Set after the table exists, because the function reads it.
alter table public.classes alter column class_code set default public.gen_class_code();
create index classes_facilitator_idx on public.classes (facilitator_id);

create table public.students (
  anon_id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  -- Checked by the students_nickname_filter trigger (same filter as join_class).
  nickname text not null,
  lang text not null check (lang in ('en', 'hi', 'te', 'ur')),
  level text not null default 'starter' check (level in ('starter', 'explorer', 'planner')),
  created_at timestamptz not null default now(),
  -- Additive: latest event time, for the progress table's inactive flag.
  last_active timestamptz
);
create unique index students_class_nickname_uq on public.students (class_id, lower(nickname));
create index students_class_created_idx on public.students (class_id, created_at);

create table public.events (
  event_id uuid primary key,
  anon_id uuid not null references public.students (anon_id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  type text not null check (type in (
    'app_open', 'onboarding_complete', 'persona_selected', 'decision_made', 'rewind_used', 'event_triggered',
    'minigame_complete', 'quiz_submitted', 'module_complete', 'badge_earned', 'language_changed', 'sync_complete'
  )),
  payload jsonb not null default '{}'::jsonb,
  -- Device time, clamped by push_events to at most 5 minutes after the server's now().
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
  -- Server time (push_events never takes it from the device).
  created_at timestamptz not null default now(),
  -- Additive: the quiz_submitted event this came from, so a re-sent batch adds no duplicate.
  event_id uuid unique references public.events (event_id) on delete cascade
);
-- One attempt per quiz type per student: the first one counts, later ones are ignored.
create unique index quiz_attempts_one_per_type_uq on public.quiz_attempts (anon_id, quiz_type);

-- ---------------------------------------------------------------------------
-- Nickname word filter (7.5). Readable only by the definer functions.
-- ---------------------------------------------------------------------------
-- Canonical form for matching: lowercase, common digit swaps, ph->f, ck->k,
-- repeated letters collapsed ("fuuuck", "phuck", "fuk" all become "fuk").
create or replace function public.nick_canon(s text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
           replace(replace(translate(lower(s), '0134578', 'oieastb'), 'ph', 'f'), 'ck', 'k'),
           '(.)\1+', '\1', 'g')
$$;

create table public.blocked_words (
  word text primary key,
  -- true: matches a whole token only ("sex" blocks "sex" but not "Essex").
  -- false: matches anywhere, for words that never occur inside innocent names.
  whole_token boolean not null default true,
  canon text generated always as (public.nick_canon(word)) stored
);
insert into public.blocked_words (word, whole_token) values
  -- English, anywhere
  ('fuck', false), ('fcuk', false), ('motherfucker', false),
  -- English, whole token
  ('fck', true), ('fuq', true), ('shit', true), ('sht', true), ('shyt', true), ('bitch', true), ('btch', true),
  ('biatch', true), ('bastard', true), ('dick', true), ('cunt', true), ('slut', true), ('whore', true), ('sex', true),
  ('sexy', true), ('porn', true), ('nude', true), ('rape', true), ('nazi', true), ('idiot', true), ('stupid', true),
  -- Hindi / Urdu (romanised), anywhere
  ('chutiya', false), ('chutia', false), ('chutiye', false), ('madarchod', false), ('behenchod', false),
  ('bhenchod', false), ('bhosdi', false), ('bhosdike', false),
  -- Hindi / Urdu (romanised), whole token
  ('gandu', true), ('randi', true), ('harami', true), ('kutta', true), ('kutiya', true), ('saala', true),
  ('chod', true), ('bsdk', true), ('bkl', true),
  -- Devanagari
  ('चूतिया', false), ('मादरचोद', false), ('बहनचोद', false),
  ('लौड़ा', true), ('गांडू', true), ('रंडी', true), ('हरामी', true), ('कुत्ता', true), ('कुतिया', true);

-- Returns null if the nickname is fine, else the error code join_class raises.
create or replace function public.nickname_problem(nick text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n text;
  flat text;
  forms text[];
  tok text;
begin
  if nick is null then
    return 'nickname_invalid';
  end if;
  -- Normalise first: NFKC folds full-width and other compatibility look-alikes,
  -- and Devanagari digits count as digits.
  n := translate(normalize(btrim(nick), NFKC), '०१२३४५६७८९', '0123456789');

  -- No phone numbers or emails: any 5+ digits in total, or an @.
  if position('@' in n) > 0 or char_length(regexp_replace(n, '[^0-9]', '', 'g')) >= 5 then
    return 'nickname_personal_info';
  end if;
  -- Only Latin letters, Devanagari, digits and space _ . - ; 2-20 characters.
  if char_length(n) < 2 or char_length(n) > 20 or n !~ '^[A-Za-z0-9ऀ-ॿ _.-]+$' then
    return 'nickname_invalid';
  end if;
  -- One script per nickname, so mixed-script look-alikes are out.
  if n ~ '[A-Za-z]' and n ~ '[ऀ-ॿ]' then
    return 'nickname_invalid';
  end if;

  -- Forms to test: the whole name with separators stripped, and each token;
  -- each with digits read as letters (g4ndu) and with digits dropped (sex69).
  flat := regexp_replace(n, '[ _.-]', '', 'g');
  if char_length(flat) < 2 then
    return 'nickname_invalid'; -- mostly separators
  end if;
  forms := array[public.nick_canon(flat), public.nick_canon(regexp_replace(flat, '[0-9]', '', 'g'))];
  foreach tok in array regexp_split_to_array(n, '[ _.-]+') loop
    if tok <> '' then
      forms := forms || public.nick_canon(tok) || public.nick_canon(regexp_replace(tok, '[0-9]', '', 'g'));
    end if;
  end loop;

  if exists (
    select 1
    from public.blocked_words b, unnest(forms) f
    where f <> '' and (f = b.canon or (not b.whole_token and position(b.canon in f) > 0))
  ) then
    return 'nickname_blocked';
  end if;
  return null;
end;
$$;

-- Every write of students.nickname (join_class, a facilitator rename, the seed)
-- goes through the same filter and length limit.
create or replace function public.students_nickname_filter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  problem text;
begin
  new.nickname := btrim(new.nickname);
  problem := public.nickname_problem(new.nickname);
  if problem is not null then
    raise exception using errcode = 'PT422', message = problem;
  end if;
  return new;
end;
$$;

create trigger students_nickname_filter
  before insert or update of nickname on public.students
  for each row execute function public.students_nickname_filter();

-- ---------------------------------------------------------------------------
-- Row-level security: allowlisted facilitators see only their own classes (5.6).
-- ---------------------------------------------------------------------------
alter table public.staff enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.events enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.blocked_words enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.staff st on st.email = lower(u.email)
    where u.id = auth.uid()
  )
$$;

create or replace function public.my_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.classes c where c.facilitator_id = auth.uid() and public.is_staff()
$$;

create policy classes_own on public.classes
  for all to authenticated
  using (facilitator_id = auth.uid() and public.is_staff())
  with check (facilitator_id = auth.uid() and public.is_staff());

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

-- Explicit privileges: students (anon) touch no table directly. Facilitators may
-- set only a class's name and language; the code, owner and id come from the
-- database (so nobody can pick an easy-to-guess code).
revoke all on public.staff, public.classes, public.students, public.events, public.quiz_attempts, public.blocked_words
  from anon, authenticated;
grant select, delete on public.classes to authenticated;
grant insert (name, default_lang) on public.classes to authenticated;
grant update (name, default_lang) on public.classes to authenticated;
grant select, delete on public.students to authenticated;
grant update (nickname) on public.students to authenticated;
grant select on public.events, public.quiz_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- join_class(class_code, nickname) -> { anon_id, class_id, default_lang }   (5.5)
-- Errors use PostgREST's PTxxx codes, so the HTTP status matches.
-- The nickname is checked before the class is looked up, so a bad nickname gives
-- the same error whether or not the code exists (no code probing that way).
-- Limits: 300 students per class, and at most 60 new students per class per minute.
-- ---------------------------------------------------------------------------
create or replace function public.join_class(class_code text, nickname text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  max_students constant int := 300;
  max_joins_per_minute constant int := 60;
  cls public.classes%rowtype;
  nick text := btrim(nickname);
  problem text;
  total int;
  recent int;
  new_id uuid;
begin
  problem := public.nickname_problem(nick);
  if problem is not null then
    raise exception using errcode = 'PT422', message = problem;
  end if;

  -- Lock the class row so concurrent joins cannot overshoot the limits.
  select * into cls from public.classes c where c.class_code = upper(btrim(join_class.class_code)) for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'class_not_found';
  end if;

  select count(*), count(*) filter (where s.created_at > now() - interval '1 minute')
    into total, recent
    from public.students s
   where s.class_id = cls.id;
  if total >= max_students then
    raise exception using errcode = 'PT403', message = 'class_full';
  end if;
  if recent >= max_joins_per_minute then
    raise exception using errcode = 'PT429', message = 'join_rate_limited';
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
-- Event payload rules for push_events.
-- Each type has an allow-list of keys. Unknown keys are DROPPED (the event is
-- kept), and so are values that are not a number, a boolean or a short id-like
-- string (^[A-Za-z0-9_.:-]{1,64}$), so no free text reaches the database.
-- Exception: quiz_submitted.answers, validated by quiz_payload_ok.
-- Returns null for an unknown type.
-- ---------------------------------------------------------------------------
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
    when 'quiz_submitted' then array['quiz_type', 'answers', 'score']
    when 'module_complete' then array['moduleId', 'pillar']
    when 'badge_earned' then array['badgeId']
    when 'language_changed' then array['lang']
  end
$$;

-- quiz_submitted payload: { quiz_type, score 0-100, answers: 1-24 x { questionId, pillar, choice, correct } }.
create or replace function public.quiz_payload_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p ->> 'quiz_type' is null or p ->> 'quiz_type' not in ('baseline', 'endline') then
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

    if ev_type = 'quiz_submitted' then
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

-- ---------------------------------------------------------------------------
-- class_progress(class_id) -> one row per student   (5.5, facilitator only via RLS)
-- security invoker: the caller's RLS decides what is visible, so another
-- facilitator's class simply returns no rows.
-- Client events are not taken at face value:
--   modules_done  distinct modules (payload moduleId, else pillar) from module_complete;
--   decisions     one per weekly slot (payload month + week): a re-made decision
--                 replaces the earlier one, and a rewind_used for that slot after the
--                 latest decision removes it. Decisions without a slot count once each;
--   last_active   device times capped at 5 minutes after the server received them.
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
    (select q.score from public.quiz_attempts q where q.anon_id = s.anon_id and q.quiz_type = 'endline' order by q.created_at limit 1)
  from public.students s
  where s.class_id = class_progress.class_id
  order by lower(s.nickname)
$$;

-- ---------------------------------------------------------------------------
-- learning_gain(class_id) -> baseline vs end-line percent correct by pillar   (5.5)
-- Matched students only: a student counts for a pillar only with answers for it
-- in both their baseline and their end-line (their first attempt of each).
-- baseline_n = endline_n = n = matched students for that pillar (n is additive).
-- Any `correct` that is not the JSON boolean true counts as wrong.
-- ---------------------------------------------------------------------------
create or replace function public.learning_gain(class_id uuid)
returns table (pillar text, baseline_avg numeric, endline_avg numeric, baseline_n int, endline_n int, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  with first_attempt as (
    select distinct on (q.anon_id, q.quiz_type) q.anon_id, q.quiz_type, q.answers
    from public.quiz_attempts q
    join public.students s on s.anon_id = q.anon_id
    where s.class_id = learning_gain.class_id
    order by q.anon_id, q.quiz_type, q.created_at
  ),
  per_student as (
    select l.anon_id, l.quiz_type, a ->> 'pillar' as pillar,
           100.0 * avg(case when a -> 'correct' = 'true'::jsonb then 1 else 0 end) as pct
    from first_attempt l
    cross join lateral jsonb_array_elements(l.answers) a
    group by l.anon_id, l.quiz_type, a ->> 'pillar'
  ),
  matched as (
    select b.anon_id, b.pillar, b.pct as baseline_pct, e.pct as endline_pct
    from per_student b
    join per_student e on e.anon_id = b.anon_id and e.pillar = b.pillar and e.quiz_type = 'endline'
    where b.quiz_type = 'baseline'
  ),
  pillars(pillar, ord) as (
    values ('plan_budget', 1), ('save_manage', 2), ('understand_investing', 3), ('stay_safe', 4)
  )
  select
    p.pillar,
    round(avg(m.baseline_pct), 1),
    round(avg(m.endline_pct), 1),
    count(m.anon_id)::int,
    count(m.anon_id)::int,
    count(m.anon_id)::int
  from pillars p
  left join matched m on m.pillar = p.pillar
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
grant execute on function public.is_staff() to authenticated;
