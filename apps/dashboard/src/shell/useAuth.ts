import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '@paisa/api-client';

export type AuthState =
  | { status: 'loading' }
  | { status: 'out' }
  /** Signed in; asking the backend whether the account is on the staff list. */
  | { status: 'checking'; email: string }
  | { status: 'failed'; email: string }
  | { status: 'not_staff'; email: string }
  | { status: 'staff'; email: string };

/**
 * Who is signed in, and are they staff. supabase-js restores the session itself (including one
 * from an invite link in the URL), so this only listens: it never reads tokens.
 */
export function useAuth(api: ApiClient) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [check, setCheck] = useState<{ email: string; result: 'staff' | 'not_staff' | 'failed' } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    // The callback only stores state; calling supabase from inside it can deadlock the client.
    const off = api.onAuthChange((e) => alive && setEmail(e));
    api
      .currentEmail()
      .then((e) => alive && setEmail((prev) => (prev === undefined ? e : prev)))
      .catch(() => alive && setEmail((prev) => (prev === undefined ? null : prev)));
    return () => {
      alive = false;
      off();
    };
  }, [api]);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    api
      .isStaff()
      .then((ok) => alive && setCheck({ email, result: ok ? 'staff' : 'not_staff' }))
      .catch(() => alive && setCheck({ email, result: 'failed' }));
    return () => {
      alive = false;
    };
  }, [api, email, attempt]);

  const state: AuthState =
    email === undefined
      ? { status: 'loading' }
      : email === null
        ? { status: 'out' }
        : check?.email === email
          ? { status: check.result, email }
          : { status: 'checking', email };

  /** Re-reads the saved session (after a sign-in or sign-out) in case no auth event arrives. */
  const refresh = useCallback(() => {
    api
      .currentEmail()
      .then(setEmail)
      .catch(() => setEmail(null));
  }, [api]);

  /** Asks the staff question again (after "ask the admin to add you", or a network failure). */
  const recheck = useCallback(() => {
    setCheck(null);
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh, recheck };
}
