# UI-2: staff sign in with email + password (api-client, auth config)

Date: 2026-10-11 07:25 IST. Lane: UI-2, touching BE-2's `packages/api-client` and `supabase/**` with the
team's go-ahead. `packages/shared` types are unchanged. Only the dashboard used the removed calls.

Why: NGO staff found "type your email, then find a 6-digit code in your inbox" confusing, and on the
local stack the code never reached Gmail at all (it went to Inbucket on :54324).

## @paisa/api-client

- Removed: `signInWithEmail(email)` and `verifyEmailCode(email, token)` (the emailed sign-in code).
- `signInWithPassword(email, password)` is now the normal staff sign-in (it was local-demo only).
- Added:
  - `signUpWithPassword(email, password): Promise<{ signedIn: boolean }>`: the one-time "Create
    account". Only emails on `public.staff` may; `signedIn` is false only if email confirmation is on.
  - `sendPasswordReset(email, redirectTo)`: emails a link to `<redirectTo>?reset=<token hash>`. No
    error for an email without an account.
  - `verifyPasswordReset(tokenHash)`: signs in from that link.
  - `setPassword(password)`: saves it and signs out the account's other sessions.
- `ApiErrorCode`: removed `auth_code_invalid`; added `auth_wrong_password`, `auth_link_invalid`,
  `auth_account_exists`, `auth_weak_password`, `auth_same_password`, `auth_email_invalid`.
  `auth_not_invited` now also means "not on the staff list" at create-account time.

## supabase

- Migration `20261011160000_staff_signup_gate.sql`: `public.staff_signup_gate(event jsonb)`, called by
  Supabase Auth before any user is created. Emails not on `public.staff` get HTTP 403 `staff_not_invited`.
- `config.toml`: sign-up on (gated by that hook), email confirmation off, custom SMTP on locally as
  well (Gmail from `.env`), 60 emails an hour, reset links valid for 1 hour, a `recovery` template
  whose link goes straight to the dashboard. The `magic_link` (sign-in code) template is gone.
- `pnpm staff:invite` now only adds the email to `public.staff` (no invite email, no auth user) and
  prints what to tell the person.

Apply locally: `npx supabase migration up`, then `npx supabase stop && npx supabase start` for the
config. Hosted: `npx supabase db push`, then `config push` as in the README.
