// One-command staff invite (README, "Staff accounts"):
//   pnpm staff:invite -- name@ngo.org
// Adds the email to the public.staff allowlist. The person then opens the dashboard, taps
// "Create account" and picks a password: only emails on the list may make an account
// (supabase/migrations/20261011160000_staff_signup_gate.sql). No email is sent. Running it again
// for the same email is harmless: the allowlist row is kept.
//
// Env: SUPABASE_URL (else VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (never commit it).
// DASHBOARD_URL, when set, is printed as the address to give the person.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** The part of a service-role SupabaseClient this script uses (tests pass a mock). */
export interface AdminClient {
  from(table: 'staff'): {
    upsert(
      values: { email: string },
      options: { onConflict: 'email'; ignoreDuplicates: true },
    ): {
      select(columns: 'email'): PromiseLike<{ data: { email: string }[] | null; error: { message: string } | null }>;
    };
  };
}

export interface InviteResult {
  email: string;
  /** false: the email was already on the allowlist. */
  addedToStaff: boolean;
}

// The same rule as public.staff's check constraint.
const EMAIL = /^[^@\s]+@[^@\s]+$/;

export async function inviteStaff(client: AdminClient, rawEmail: string): Promise<InviteResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`Not an email address: ${JSON.stringify(rawEmail)}`);

  // ignoreDuplicates: an existing row is kept, and only a newly inserted row comes back.
  const { data, error } = await client
    .from('staff')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
    .select('email');
  if (error) throw new Error(`Adding ${email} to public.staff failed: ${error.message}`);

  return { email, addedToStaff: (data?.length ?? 0) > 0 };
}

/** The settings main() needs from the environment, or the problem with them. */
export function inviteConfig(env: NodeJS.ProcessEnv): { url: string; key: string; dashboardUrl?: string } | string {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return 'Set SUPABASE_URL (or VITE_SUPABASE_URL) to the project URL.';
  if (!key) return 'Set SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API, or `npx supabase status` locally).';
  return { url, key, dashboardUrl: env.DASHBOARD_URL || undefined };
}

/** What to print, including what to tell the new staff member. */
export function inviteMessage(result: InviteResult, dashboardUrl?: string): string {
  const where = dashboardUrl ?? 'the staff dashboard';
  return (
    `${result.email}: ${result.addedToStaff ? 'added to' : 'already on'} the staff list.\n` +
    `Tell them: open ${where}, tap "First time here? Create your account", and use ${result.email} with a password of their choice.`
  );
}

async function main(): Promise<void> {
  const email = process.argv.slice(2).find((a) => a !== '--');
  if (!email) {
    console.error('Usage: pnpm staff:invite -- name@ngo.org');
    process.exit(1);
  }
  const config = inviteConfig(process.env);
  if (typeof config === 'string') {
    console.error(config);
    process.exit(1);
  }
  // supabase-js is a dependency of @paisa/api-client, not of the workspace root, so load the
  // api-client's copy (the same version the apps use).
  const require = createRequire(new URL('../../packages/api-client/package.json', import.meta.url));
  const { createClient } = require('@supabase/supabase-js') as {
    createClient(url: string, key: string, options: object): AdminClient;
  };
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(inviteMessage(await inviteStaff(client, email), config.dashboardUrl));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
