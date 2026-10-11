import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, createApiClient, toAuthError } from '../src';

type AuthResult = { data?: unknown; error: { message: string; code?: string; status?: number } | null };

/** A supabase client with just the auth calls the dashboard uses. */
function fakeAuth(result: AuthResult, session: { user: { email: string } } | null = null) {
  const unsubscribe = vi.fn();
  let listener: ((event: string, s: typeof session) => void) | undefined;
  const auth = {
    signUp: vi.fn(async () => result),
    resetPasswordForEmail: vi.fn(async () => result),
    verifyOtp: vi.fn(async () => result),
    updateUser: vi.fn(async () => result),
    signInWithPassword: vi.fn(async () => result),
    signOut: vi.fn(async () => ({ error: null })),
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((cb: typeof listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  const sb = {
    auth,
    rpc: vi.fn(async () => ({ data: true, error: null })),
  } as unknown as SupabaseClient & { auth: typeof auth; rpc: ReturnType<typeof vi.fn> };
  return { sb, unsubscribe, emit: (s: typeof session) => listener?.('SIGNED_IN', s) };
}

describe('staff sign-in', () => {
  const client = (result: AuthResult) => {
    const { sb } = fakeAuth(result);
    return { sb, api: createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb }) };
  };

  it('signs in with email and password', async () => {
    const { sb, api } = client({ error: null });
    await api.signInWithPassword('t@ngo.org', 'pw-12345');
    expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({ email: 't@ngo.org', password: 'pw-12345' });
  });

  it('creates an account and says whether it is signed in', async () => {
    const { sb, api } = client({ data: { session: { access_token: 'a' }, user: {} }, error: null });
    expect(await api.signUpWithPassword('t@ngo.org', 'pw-12345')).toEqual({ signedIn: true });
    expect(sb.auth.signUp).toHaveBeenCalledWith({ email: 't@ngo.org', password: 'pw-12345' });
    // With email confirmation on, GoTrue answers with a user and no session.
    expect(await client({ data: { session: null, user: {} }, error: null }).api.signUpWithPassword('t@ngo.org', 'pw-12345')).toEqual({
      signedIn: false,
    });
  });

  it('sends a reset link to the given page, checks its token hash, and sets the new password', async () => {
    const { sb, api } = client({ error: null });
    await api.sendPasswordReset('t@ngo.org', 'https://dash.example.org/');
    expect(sb.auth.resetPasswordForEmail).toHaveBeenCalledWith('t@ngo.org', { redirectTo: 'https://dash.example.org/' });
    await api.verifyPasswordReset('hash123');
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash123', type: 'recovery' });
    await api.setPassword('new-pass-1');
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: 'new-pass-1' });
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('keeps the other sessions when the new password was refused', async () => {
    const { sb, api } = client({ error: { message: 'Password should be at least 8 characters.', code: 'weak_password', status: 422 } });
    await expect(api.setPassword('short')).rejects.toMatchObject({ code: 'auth_weak_password' });
    expect(sb.auth.signOut).not.toHaveBeenCalled();
  });

  it('maps GoTrue errors to codes the dashboard can explain', async () => {
    const cases: [NonNullable<AuthResult['error']>, string][] = [
      [{ message: 'staff_not_invited', status: 403 }, 'auth_not_invited'],
      [{ message: 'staff_not_invited', code: 'unexpected_failure', status: 403 }, 'auth_not_invited'],
      [{ message: 'Signups not allowed for this instance', code: 'signup_disabled', status: 422 }, 'auth_not_invited'],
      [{ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 }, 'auth_wrong_password'],
      [{ message: 'Invalid login credentials', status: 400 }, 'auth_wrong_password'],
      [{ message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 }, 'auth_wrong_password'],
      [{ message: 'Email link is invalid or has expired', code: 'otp_expired', status: 403 }, 'auth_link_invalid'],
      [{ message: 'Token has expired or is invalid', status: 403 }, 'auth_link_invalid'],
      [{ message: 'User already registered', code: 'user_already_exists', status: 422 }, 'auth_account_exists'],
      [{ message: 'Password should be at least 8 characters.', code: 'weak_password', status: 422 }, 'auth_weak_password'],
      [
        { message: 'New password should be different from the old password.', code: 'same_password', status: 422 },
        'auth_same_password',
      ],
      [{ message: 'New password should be different from the old password.', status: 422 }, 'auth_same_password'],
      [{ message: 'Email address "x@y" is invalid', code: 'email_address_invalid', status: 400 }, 'auth_email_invalid'],
      [{ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 }, 'auth_rate_limited'],
      [{ message: 'For security purposes, you can only request this after 52 seconds.', status: 429 }, 'auth_rate_limited'],
      [{ message: 'Failed to fetch' }, 'network'],
      [{ message: 'Error sending recovery email', status: 500 }, 'unknown'],
    ];
    for (const [error, code] of cases) {
      const { api } = client({ error });
      await expect(api.signInWithPassword('t@ngo.org', 'pw'), error.message).rejects.toMatchObject({ code });
      await expect(api.signUpWithPassword('t@ngo.org', 'pw')).rejects.toBeInstanceOf(ApiError);
      await expect(api.sendPasswordReset('t@ngo.org', 'http://x/')).rejects.toBeInstanceOf(ApiError);
      await expect(api.verifyPasswordReset('h')).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('reports the signed-in email and its changes, and whether they are staff', async () => {
    const { sb, unsubscribe, emit } = fakeAuth({ error: null }, { user: { email: 't@ngo.org' } });
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    expect(await api.currentEmail()).toBe('t@ngo.org');
    const seen: (string | null)[] = [];
    const stop = api.onAuthChange((e) => seen.push(e));
    emit({ user: { email: 'u@ngo.org' } });
    emit(null);
    expect(seen).toEqual(['u@ngo.org', null]);
    stop();
    expect(unsubscribe).toHaveBeenCalled();
    expect(await api.isStaff()).toBe(true);
    expect(sb.rpc).toHaveBeenCalledWith('is_staff', {});
  });

  it('toAuthError never throws on empty input', () => {
    expect(toAuthError(null)).toMatchObject({ code: 'unknown' });
    expect(toAuthError({})).toMatchObject({ code: 'unknown' });
  });
});
