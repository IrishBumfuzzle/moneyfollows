-- Class settings and rejoining: the end-line gate, and a recovery code for a lost or reset phone.
--
--   * classes.endline_open (default false): the facilitator opens the end-line quiz for the
--     class. Students read it with class_status(anon_id, class_id), and join_class returns it.
--   * students.rejoin_code: 6 characters from the class-code alphabet, generated at join (and
--     backfilled here). A student on a new phone calls rejoin_class(class_code, nickname,
--     rejoin_code) and gets their anon_id back, so their history continues. A teacher can read
--     the code out (facilitators already read students through RLS) or reset it with
--     reset_rejoin_code(anon_id).
--   * rejoin_class failures are throttled per class in rejoin_failures, a table only these
--     functions touch.
--
-- join_class keeps everything 20261011090500_join_class_v2.sql does; only endline_open and
-- rejoin_code are added to its result. create or replace keeps its grants (anon, authenticated).

-- ---------------------------------------------------------------------------
-- classes.endline_open
-- ---------------------------------------------------------------------------
alter table public.classes add column endline_open boolean not null default false;
-- The classes_own policy still limits updates to the facilitator's own classes.
grant update (endline_open) on public.classes to authenticated;

-- ---------------------------------------------------------------------------
-- students.rejoin_code
-- 6 characters from gen_class_code's alphabet (no 0/O, 1/I/L), from a cryptographic RNG with
-- rejection sampling. Not unique: it is only ever matched together with class and nickname.
-- ---------------------------------------------------------------------------
create function public.gen_rejoin_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 characters
  code text := '';
  bytes bytea;
  b int;
begin
  while char_length(code) < 6 loop
    bytes := extensions.gen_random_bytes(12);
    for i in 0..11 loop
      b := get_byte(bytes, i);
      -- 248 = 31 * 8: bytes above it would bias the first characters.
      if b < 248 and char_length(code) < 6 then
        code := code || substr(alphabet, 1 + (b % 31), 1);
      end if;
    end loop;
  end loop;
  return code;
end;
$$;
-- Only the column default (inside join_class, the seed and this migration) calls it.
revoke execute on function public.gen_rejoin_code() from public, anon, authenticated;

alter table public.students add column rejoin_code text;
-- Backfill: the function is volatile, so every existing student gets their own code.
update public.students set rejoin_code = public.gen_rejoin_code();
alter table public.students
  alter column rejoin_code set default public.gen_rejoin_code(),
  alter column rejoin_code set not null,
  add constraint students_rejoin_code_check check (rejoin_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');
-- Facilitators read it (select on students); they change it only through reset_rejoin_code.

-- ---------------------------------------------------------------------------
-- rejoin_failures: one row per failed rejoin_class for an existing class, kept 10 minutes.
-- No grants: only the security-definer functions read or write it.
-- ---------------------------------------------------------------------------
create table public.rejoin_failures (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes (id) on delete cascade,
  at timestamptz not null default now()
);
create index rejoin_failures_class_at_idx on public.rejoin_failures (class_id, at);
alter table public.rejoin_failures enable row level security;
-- Supabase's default privileges grant new tables to anon and authenticated; take them back.
revoke all on public.rejoin_failures from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- join_class(class_code, nickname, lang)
--   -> { anon_id, class_id, default_lang, endline_open, rejoin_code }   (5.5, additive)
-- Errors use PostgREST's PTxxx codes, so the HTTP status matches.
-- The nickname is checked before the class is looked up, so a bad nickname gives
-- the same error whether or not the code exists (no code probing that way).
-- Limits: 300 students per class, and at most 60 new students per class per minute.
-- ---------------------------------------------------------------------------
create or replace function public.join_class(class_code text, nickname text, lang text default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  max_students constant int := 300;
  max_joins_per_minute constant int := 60;
  max_suggestions constant int := 3;
  cls public.classes%rowtype;
  nick text := btrim(nickname);
  student_lang text;
  problem text;
  total int;
  recent int;
  new_id uuid;
  new_code text;
  suffix text;
  candidate text;
  suggestions text[] := array[]::text[];
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
  if not cls.join_open then
    raise exception using errcode = 'PT403', message = 'class_closed';
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

  student_lang := lower(btrim(join_class.lang));
  if student_lang is null or student_lang not in ('en', 'hi', 'te', 'ur') then
    student_lang := cls.default_lang;
  end if;

  begin
    insert into public.students (class_id, nickname, lang)
    values (cls.id, nick, student_lang)
    returning anon_id, rejoin_code into new_id, new_code;
  exception when unique_violation then
    -- Suggest the name plus a short number (trimmed to 20 characters), keeping only ones
    -- that pass the filter and are free in this class. The class row is still locked, so
    -- they are free right now; a later join may still take one.
    for n in 2..99 loop
      exit when cardinality(suggestions) >= max_suggestions;
      suffix := n::text;
      candidate := btrim(left(nick, 20 - char_length(suffix))) || suffix;
      continue when public.nickname_problem(candidate) is not null;
      continue when candidate = any (suggestions);
      continue when exists (
        select 1 from public.students s where s.class_id = cls.id and lower(s.nickname) = lower(candidate)
      );
      suggestions := suggestions || candidate;
    end loop;
    raise exception using errcode = 'PT409', message = 'nickname_taken', detail = to_json(suggestions)::text;
  end;

  return json_build_object(
    'anon_id', new_id, 'class_id', cls.id, 'default_lang', cls.default_lang,
    'endline_open', cls.endline_open, 'rejoin_code', new_code
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- class_status(anon_id, class_id) -> { endline_open, default_lang, rejoin_code }
-- For the student app, which holds both ids. rejoin_code is included (additive) so a student
-- who joined before codes existed, or whose code a teacher reset, can see the current one.
-- A pair that is not a student of that class gets class_not_found, like any other miss.
-- ---------------------------------------------------------------------------
create function public.class_status(anon_id uuid, class_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result json;
begin
  select json_build_object('endline_open', c.endline_open, 'default_lang', c.default_lang, 'rejoin_code', s.rejoin_code)
    into result
    from public.students s
    join public.classes c on c.id = s.class_id
   where s.anon_id = class_status.anon_id and s.class_id = class_status.class_id;
  if result is null then
    raise exception using errcode = 'PT404', message = 'class_not_found';
  end if;
  return result;
end;
$$;

revoke execute on function public.class_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.class_status(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rejoin_class(class_code, nickname, rejoin_code) -> the same shape as join_class
-- For an existing student on a new or reset phone, so it works even when join_open is false
-- and ignores the class's size and join limits. Case-insensitive throughout.
--
-- Any mismatch (wrong code, nickname or class) gives rejoin_failed (HTTP 404), identical in
-- every case, so it never reveals which part was wrong. More than 20 failures for a class in
-- 10 minutes gives join_rate_limited (PT429) until they age out, even for a correct code.
--
-- A failure must be recorded, and a raised error would roll that row back. So rejoin_failed is
-- not raised: the function sets PostgREST's response.status to 404 and returns PostgREST's error
-- body { code, message, details, hint }. The transaction commits and the client sees the same
-- error a raise would give. The rate limit has nothing to record, so it is raised as usual.
-- ---------------------------------------------------------------------------
create function public.rejoin_class(class_code text, nickname text, rejoin_code text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  max_failures constant int := 20;
  window_length constant interval := interval '10 minutes';
  cls public.classes%rowtype;
  stu public.students%rowtype;
  failures int;
begin
  -- Lock the class row so parallel guesses are counted one after another.
  select * into cls from public.classes c where c.class_code = upper(btrim(rejoin_class.class_code)) for update;

  if found then
    select count(*) into failures
      from public.rejoin_failures f
     where f.class_id = cls.id and f.at > now() - window_length;
    if failures >= max_failures then
      raise exception using errcode = 'PT429', message = 'join_rate_limited';
    end if;

    select * into stu
      from public.students s
     where s.class_id = cls.id
       and lower(s.nickname) = lower(btrim(rejoin_class.nickname))
       and s.rejoin_code = upper(btrim(rejoin_class.rejoin_code));
    if found then
      return json_build_object(
        'anon_id', stu.anon_id, 'class_id', cls.id, 'default_lang', cls.default_lang,
        'endline_open', cls.endline_open, 'rejoin_code', stu.rejoin_code
      );
    end if;

    delete from public.rejoin_failures f where f.class_id = cls.id and f.at <= now() - window_length;
    insert into public.rejoin_failures (class_id) values (cls.id);
  end if;

  perform set_config('response.status', '404', true);
  return json_build_object('code', 'PT404', 'message', 'rejoin_failed', 'details', null, 'hint', null);
end;
$$;

revoke execute on function public.rejoin_class(text, text, text) from public, anon, authenticated;
grant execute on function public.rejoin_class(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- reset_rejoin_code(anon_id) -> the student's new code
-- Only the facilitator who owns the student's class and is on the staff allowlist (the
-- classes_own rule). Anyone else gets class_not_found, so it never confirms an id exists.
-- ---------------------------------------------------------------------------
create function public.reset_rejoin_code(anon_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  update public.students s
     set rejoin_code = public.gen_rejoin_code()
    from public.classes c
   where s.anon_id = reset_rejoin_code.anon_id
     and c.id = s.class_id
     and c.facilitator_id = auth.uid()
     and public.is_staff()
  returning s.rejoin_code into new_code;
  if not found then
    raise exception using errcode = 'PT404', message = 'class_not_found';
  end if;
  return new_code;
end;
$$;

revoke execute on function public.reset_rejoin_code(uuid) from public, anon, authenticated;
grant execute on function public.reset_rejoin_code(uuid) to authenticated;
