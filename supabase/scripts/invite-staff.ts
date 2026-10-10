// One-command staff invite (README, "Staff accounts"):
//   pnpm staff:invite -- name@ngo.org
// Invites the email through the Supabase Admin API and adds it to the public.staff allowlist.
// Running it again for the same email is harmless: an account that already accepted its invite is
// left as it is, an invite not yet accepted is sent again, and the allowlist row is kept.
//
// Env: SUPABASE_URL (else VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (never commit it).
// DASHBOARD_URL, when set, is where the invite link sends the person.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** The part of a service-role SupabaseClient this script uses (tests pass a mock). */
export interface AdminClient {
  auth: {
    admin: {
      inviteUserByEmail(
        email: string,
        options?: { redirectTo?: string },
      ): PromiseLike<{ error: { message: string; code?: string; status?: number } | null }>;
    };
  };
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
  /** false: the account already existed and had accepted an invite, so nothing was sent. */
  invited: boolean;
  /** false: the email was already on the allowlist. */
  addedToStaff: boolean;
}

// The same rule as public.staff's check constraint.
const EMAIL = /^[^@\s]+@[^@\s]+$/;

export async function inviteStaff(
  client: AdminClient,
  rawEmail: string,
  opts: { redirectTo?: string } = {},
): Promise<InviteResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`Not an email address: ${JSON.stringify(rawEmail)}`);

  const { error: inviteError } = await client.auth.admin.inviteUserByEmail(
    email,
    opts.redirectTo ? { redirectTo: opts.redirectTo } : undefined,
  );
  // Auth refuses to invite an account that is already confirmed; that is the "ran it twice" case.
  const alreadyRegistered =
    inviteError !== null && (inviteError.code === 'email_exists' || /already been registered/i.test(inviteError.message));
  if (inviteError && !alreadyRegistered) throw new Error(`Invite failed: ${inviteError.message}`);

  // ignoreDuplicates: an existing row is kept, and only a newly inserted row comes back.
  const { data, error } = await client
    .from('staff')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
    .select('email');
  if (error) throw new Error(`Adding ${email} to public.staff failed: ${error.message}`);

  return { email, invited: !alreadyRegistered, addedToStaff: (data?.length ?? 0) > 0 };
}

/** The settings main() needs from the environment, or the problem with them. */
export function inviteConfig(env: NodeJS.ProcessEnv): { url: string; key: string; redirectTo?: string } | string {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return 'Set SUPABASE_URL (or VITE_SUPABASE_URL) to the project URL.';
  if (!key) return 'Set SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API, or `npx supabase status` locally).';
  return { url, key, redirectTo: env.DASHBOARD_URL || undefined };
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

  const result = await inviteStaff(client, email, { redirectTo: config.redirectTo });
  console.log(
    `${result.email}: ${result.invited ? 'invite sent' : 'already has an account, no invite sent'}; ` +
      `${result.addedToStaff ? 'added to' : 'already on'} the staff allowlist.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
