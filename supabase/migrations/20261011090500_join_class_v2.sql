-- join_class v2: the student's own language, nickname suggestions, classes closed to new
-- joins, and rotating a leaked class code.
--
--   * join_class(class_code, nickname, lang default null): onboarding picks the language before
--     joining, so a valid lang ('en', 'hi', 'te', 'ur') is saved as the student's; null or
--     anything else falls back to the class default. The result is unchanged (default_lang is
--     still the class's). The 2-argument version is dropped first: with both overloads,
--     PostgREST cannot tell which one a named-argument call means.
--   * nickname_taken carries up to 3 free alternatives in the error's detail, as a JSON array.
--   * classes.join_open: false makes join_class raise class_closed (PT403). Facilitators may
--     update it. Students who already joined keep playing.
--   * rotate_class_code(class_id): a fresh code for a leaked one. Students hold class_id, not
--     the code, so they keep syncing; only new joins need the new code.

-- ---------------------------------------------------------------------------
-- classes.join_open
-- ---------------------------------------------------------------------------
alter table public.classes add column join_open boolean not null default true;
-- The classes_own policy still limits updates to the facilitator's own classes.
grant update (join_open) on public.classes to authenticated;

-- ---------------------------------------------------------------------------
-- join_class(class_code, nickname, lang) -> { anon_id, class_id, default_lang }   (5.5)
-- Errors use PostgREST's PTxxx codes, so the HTTP status matches.
-- The nickname is checked before the class is looked up, so a bad nickname gives
-- the same error whether or not the code exists (no code probing that way).
-- Limits: 300 students per class, and at most 60 new students per class per minute.
-- ---------------------------------------------------------------------------
drop function public.join_class(text, text);

create function public.join_class(class_code text, nickname text, lang text default null)
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
    returning anon_id into new_id;
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

  return json_build_object('anon_id', new_id, 'class_id', cls.id, 'default_lang', cls.default_lang);
end;
$$;

-- A new function is executable by public by default (and Supabase's default privileges add
-- anon and authenticated), so set the grants explicitly: students join with the anon key.
revoke execute on function public.join_class(text, text, text) from public, anon, authenticated;
grant execute on function public.join_class(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rotate_class_code(class_id) -> the new code
-- Only the owning facilitator on the staff allowlist (the classes_own rule). Anyone else gets
-- class_not_found, so the call never confirms that an id exists.
-- ---------------------------------------------------------------------------
create function public.rotate_class_code(class_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  update public.classes c
     set class_code = public.gen_class_code()
   where c.id = rotate_class_code.class_id
     and c.facilitator_id = auth.uid()
     and public.is_staff()
  returning c.class_code into new_code;
  if not found then
    raise exception using errcode = 'PT404', message = 'class_not_found';
  end if;
  return new_code;
end;
$$;

revoke execute on function public.rotate_class_code(uuid) from public, anon, authenticated;
grant execute on function public.rotate_class_code(uuid) to authenticated;
