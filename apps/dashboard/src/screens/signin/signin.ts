import { apiCode, isNetworkError } from '../../shell/errors';

/** What the sign-in card is doing: sign in, create an account once, or ask for a reset link. */
export type Mode = 'signin' | 'signup' | 'forgot';

/** minimum_password_length in supabase/config.toml, so the form never allows what the server refuses. */
export const PASSWORD_MIN = 8;
/** bcrypt reads at most 72 bytes; longer passwords are refused by the server. */
export const PASSWORD_MAX = 72;

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** Deliberately loose: the server decides who is on the staff list; this only catches typos. */
export const isValidEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());

/**
 * The content key for a password the form should not send yet, or null. Sign-in only needs
 * something typed (older passwords may be shorter); a new password needs PASSWORD_MIN characters.
 */
export function passwordProblem(password: string, isNew: boolean): string | null {
  if (password === '') return 'signin.err.password_empty';
  if (isNew && password.length < PASSWORD_MIN) return 'signin.err.password_short';
  return null;
}

/**
 * The content key explaining a failed step. `demo` is the local demo button, whose failure
 * means something else; in `forgot` an unexplained failure is most likely the email not sending.
 */
export function signInErrorKey(err: unknown, opts: { demo?: boolean; mode?: Mode } = {}): string {
  if (isNetworkError(err)) return 'signin.err.network';
  switch (apiCode(err)) {
    case 'auth_not_invited':
      return 'signin.err.not_invited';
    case 'auth_wrong_password':
      return opts.demo ? 'signin.err.demo' : 'signin.err.wrong_password';
    case 'auth_account_exists':
      return 'signin.err.account_exists';
    case 'auth_weak_password':
      return 'signin.err.weak_password';
    case 'auth_link_invalid':
      return 'signin.err.link_invalid';
    case 'auth_email_invalid':
      return 'signin.err.email';
    case 'auth_rate_limited':
      return 'signin.err.rate_limited';
    default:
      return opts.mode === 'forgot' ? 'signin.err.send_failed' : 'signin.err.unknown';
  }
}

/** Where a reset link should bring the person back to: this page, without its query or hash. */
export const resetRedirect = (loc: Pick<Location, 'origin' | 'pathname'>) => `${loc.origin}${loc.pathname}`;
