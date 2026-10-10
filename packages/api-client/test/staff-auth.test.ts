import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, createApiClient, toAuthError } from '../src';

type AuthResult = { data?: unknown; error: { message: string; code?: string; status?: number } | null };

/** A supabase client with just the auth calls the dashboard uses. */
function fakeAuth(result: AuthResult, session: { user: { email: string } } | null = null) {
  const unsubscribe = vi.fn();
  let listener: ((event: string, s: typeof session) => void) | undefined;
  const auth = {
    signInWithOtp: vi.fn(async () => result),
    verifyOtp: vi.fn(async () => result),
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
  it('sends a code only to existing accounts and verifies it as an email OTP', async () => {
    const { sb } = fakeAuth({ error: null });
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    await api.signInWithEmail('t@ngo.org');
    expect(sb.auth.signInWithOtp).toHaveBeenCalledWith({ email: 't@ngo.org', options: { shouldCreateUser: false } });
    await api.verifyEmailCode('t@ngo.org', '123456');
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ email: 't@ngo.org', token: '123456', type: 'email' });
  });

  it('maps GoTrue errors to codes the dashboard can explain', async () => {
    const cases: [AuthResult['error'], string][] = [
      [{ message: 'Signups not allowed for otp', code: 'otp_disabled', status: 422 }, 'auth_not_invited'],
      [{ message: 'Signups not allowed for this instance', code: 'signup_disabled', status: 422 }, 'auth_not_invited'],
      [{ message: 'Token has expired or is invalid', code: 'otp_expired', status: 403 }, 'auth_code_invalid'],
      [{ message: 'Token has expired or is invalid', status: 403 }, 'auth_code_invalid'],
      [{ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 }, 'auth_code_invalid'],
      [{ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 }, 'auth_rate_limited'],
      [{ message: 'For security purposes, you can only request this after 52 seconds.', status: 429 }, 'auth_rate_limited'],
      [{ message: 'Failed to fetch' }, 'network'],
      [{ message: 'Database error', status: 500 }, 'unknown'],
    ];
    for (const [error, code] of cases) {
      const { sb } = fakeAuth({ error });
      const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
      await expect(api.signInWithEmail('t@ngo.org'), error!.message).rejects.toMatchObject({ code });
      await expect(api.verifyEmailCode('t@ngo.org', '000000')).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('signs the local demo facilitator in with a password', async () => {
    const { sb } = fakeAuth({ error: null });
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    await api.signInWithPassword('demo.facilitator@example.org', 'pw');
    expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'demo.facilitator@example.org', password: 'pw' });
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
