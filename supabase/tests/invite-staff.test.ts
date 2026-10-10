import { describe, expect, it, vi } from 'vitest';
import { inviteConfig, inviteStaff, type AdminClient } from '../scripts/invite-staff';

// No database: the Supabase Admin API and the staff table are mocked.
function fakeAdmin(opts: { registered?: Set<string>; inviteError?: { message: string; code?: string } } = {}) {
  const registered = opts.registered ?? new Set<string>();
  const staff = new Set<string>();
  const inviteUserByEmail = vi.fn(async (email: string, _options?: { redirectTo?: string }) => {
    if (opts.inviteError) return { error: opts.inviteError };
    if (registered.has(email)) {
      return { error: { message: 'A user with this email address has already been registered', code: 'email_exists' } };
    }
    registered.add(email);
    return { error: null };
  });
  const upsert = vi.fn((values: { email: string }, _options: { onConflict: 'email'; ignoreDuplicates: true }) => ({
    select: async (_columns: 'email') => {
      if (staff.has(values.email)) return { data: [], error: null };
      staff.add(values.email);
      return { data: [{ email: values.email }], error: null };
    },
  }));
  const from = vi.fn((_table: 'staff') => ({ upsert }));
  const client: AdminClient = { auth: { admin: { inviteUserByEmail } }, from };
  return { client, staff, inviteUserByEmail, upsert, from };
}

describe('inviteStaff', () => {
  it('invites the email lowercase and adds it to the staff allowlist', async () => {
    const f = fakeAdmin();
    expect(await inviteStaff(f.client, '  Name@NGO.org ')).toEqual({
      email: 'name@ngo.org',
      invited: true,
      addedToStaff: true,
    });
    expect(f.inviteUserByEmail).toHaveBeenCalledWith('name@ngo.org', undefined);
    expect(f.from).toHaveBeenCalledWith('staff');
    expect(f.upsert).toHaveBeenCalledWith({ email: 'name@ngo.org' }, { onConflict: 'email', ignoreDuplicates: true });
    expect([...f.staff]).toEqual(['name@ngo.org']);
  });

  it('sends the invite link to DASHBOARD_URL when given', async () => {
    const f = fakeAdmin();
    await inviteStaff(f.client, 'name@ngo.org', { redirectTo: 'https://dash.example.org' });
    expect(f.inviteUserByEmail).toHaveBeenCalledWith('name@ngo.org', { redirectTo: 'https://dash.example.org' });
  });

  it('is harmless to run twice for the same email', async () => {
    const f = fakeAdmin();
    await inviteStaff(f.client, 'name@ngo.org');
    expect(await inviteStaff(f.client, 'NAME@ngo.org')).toEqual({
      email: 'name@ngo.org',
      invited: false,
      addedToStaff: false,
    });
    expect([...f.staff]).toEqual(['name@ngo.org']);
  });

  it('still adds an existing account to the allowlist', async () => {
    const f = fakeAdmin({ registered: new Set(['old@ngo.org']) });
    expect(await inviteStaff(f.client, 'old@ngo.org')).toEqual({
      email: 'old@ngo.org',
      invited: false,
      addedToStaff: true,
    });
  });

  it('stops on other invite errors without touching the allowlist', async () => {
    const f = fakeAdmin({ inviteError: { message: 'Invalid API key' } });
    await expect(inviteStaff(f.client, 'name@ngo.org')).rejects.toThrow(/Invite failed: Invalid API key/);
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it('refuses something that is not an email before calling anything', async () => {
    const f = fakeAdmin();
    for (const bad of ['', 'name', 'a b@ngo.org', '@ngo.org']) {
      await expect(inviteStaff(f.client, bad), bad).rejects.toThrow(/Not an email address/);
    }
    expect(f.inviteUserByEmail).not.toHaveBeenCalled();
  });
});

describe('inviteConfig', () => {
  it('reads SUPABASE_URL, else VITE_SUPABASE_URL, the service role key and DASHBOARD_URL', () => {
    expect(inviteConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toEqual({
      url: 'https://a.supabase.co',
      key: 'k',
      redirectTo: undefined,
    });
    expect(
      inviteConfig({
        SUPABASE_URL: '',
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
        DASHBOARD_URL: 'https://dash.example.org',
      }),
    ).toEqual({ url: 'http://127.0.0.1:54321', key: 'k', redirectTo: 'https://dash.example.org' });
  });

  it('explains what is missing', () => {
    expect(inviteConfig({ SUPABASE_SERVICE_ROLE_KEY: 'k' })).toMatch(/SUPABASE_URL/);
    expect(inviteConfig({ VITE_SUPABASE_URL: 'http://x' })).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
