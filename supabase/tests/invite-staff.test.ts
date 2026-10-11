import { describe, expect, it, vi } from 'vitest';
import { inviteConfig, inviteMessage, inviteStaff, type AdminClient } from '../scripts/invite-staff';

// No database: the staff table is mocked.
function fakeAdmin(opts: { upsertError?: { message: string } } = {}) {
  const staff = new Set<string>();
  const upsert = vi.fn((values: { email: string }, _options: { onConflict: 'email'; ignoreDuplicates: true }) => ({
    select: async (_columns: 'email') => {
      if (opts.upsertError) return { data: null, error: opts.upsertError };
      if (staff.has(values.email)) return { data: [], error: null };
      staff.add(values.email);
      return { data: [{ email: values.email }], error: null };
    },
  }));
  const from = vi.fn((_table: 'staff') => ({ upsert }));
  const client: AdminClient = { from };
  return { client, staff, upsert, from };
}

describe('inviteStaff', () => {
  it('adds the email lowercase to the staff allowlist', async () => {
    const f = fakeAdmin();
    expect(await inviteStaff(f.client, '  Name@NGO.org ')).toEqual({ email: 'name@ngo.org', addedToStaff: true });
    expect(f.from).toHaveBeenCalledWith('staff');
    expect(f.upsert).toHaveBeenCalledWith({ email: 'name@ngo.org' }, { onConflict: 'email', ignoreDuplicates: true });
    expect([...f.staff]).toEqual(['name@ngo.org']);
  });

  it('is harmless to run twice for the same email', async () => {
    const f = fakeAdmin();
    await inviteStaff(f.client, 'name@ngo.org');
    expect(await inviteStaff(f.client, 'NAME@ngo.org')).toEqual({ email: 'name@ngo.org', addedToStaff: false });
    expect([...f.staff]).toEqual(['name@ngo.org']);
  });

  it('reports a failed insert', async () => {
    const f = fakeAdmin({ upsertError: { message: 'Invalid API key' } });
    await expect(inviteStaff(f.client, 'name@ngo.org')).rejects.toThrow(/public\.staff failed: Invalid API key/);
  });

  it('refuses something that is not an email before calling anything', async () => {
    const f = fakeAdmin();
    for (const bad of ['', 'name', 'a b@ngo.org', '@ngo.org']) {
      await expect(inviteStaff(f.client, bad), bad).rejects.toThrow(/Not an email address/);
    }
    expect(f.upsert).not.toHaveBeenCalled();
  });
});

describe('inviteMessage', () => {
  it('tells the admin what to pass on, with the dashboard address when known', () => {
    const msg = inviteMessage({ email: 'name@ngo.org', addedToStaff: true }, 'https://dash.example.org');
    expect(msg).toContain('name@ngo.org: added to the staff list.');
    expect(msg).toContain('open https://dash.example.org');
    expect(msg).toContain('Create your account');
    expect(inviteMessage({ email: 'name@ngo.org', addedToStaff: false })).toContain('already on the staff list');
  });
});

describe('inviteConfig', () => {
  it('reads SUPABASE_URL, else VITE_SUPABASE_URL, the service role key and DASHBOARD_URL', () => {
    expect(inviteConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toEqual({
      url: 'https://a.supabase.co',
      key: 'k',
      dashboardUrl: undefined,
    });
    expect(
      inviteConfig({
        SUPABASE_URL: '',
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
        DASHBOARD_URL: 'https://dash.example.org',
      }),
    ).toEqual({ url: 'http://127.0.0.1:54321', key: 'k', dashboardUrl: 'https://dash.example.org' });
  });

  it('explains what is missing', () => {
    expect(inviteConfig({ SUPABASE_SERVICE_ROLE_KEY: 'k' })).toMatch(/SUPABASE_URL/);
    expect(inviteConfig({ VITE_SUPABASE_URL: 'http://x' })).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
