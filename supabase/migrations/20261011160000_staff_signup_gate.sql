-- Staff make their own account: the admin adds the email to public.staff (pnpm staff:invite),
-- then the person opens the dashboard, taps "Create account" and picks a password. No invite
-- link, no emailed sign-in code.
--
-- Sign-up is on in supabase/config.toml, so Supabase Auth must refuse every other email. It calls
-- this function before it creates any user ([auth.hook.before_user_created]): an email on the
-- allowlist goes ahead, anything else is refused with HTTP 403 and the message
-- `staff_not_invited` (the api-client maps it to auth_not_invited). Students never have accounts.
-- Users already in auth.users are not affected; is_staff() still gates every class.

create or replace function public.staff_signup_gate(event jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.staff s where s.email = lower(event -> 'user' ->> 'email'))
      then '{}'::jsonb
    else jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'staff_not_invited'))
  end
$$;

-- Only Supabase Auth calls it. supabase_auth_admin exists on every Supabase database; the plain
-- Postgres of the SQL tests (auth-stub.sql) has no such role, so the grant is skipped there.
revoke execute on function public.staff_signup_gate(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.staff_signup_gate(jsonb) to supabase_auth_admin;
  end if;
end
$$;
