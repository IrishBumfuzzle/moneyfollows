import { apiCode, isNetworkError } from '../../shell/errors';

export const CODE_LENGTH = 6;
/** The code box takes a little more than the code, so a pasted "123 456" reaches cleanOtp whole instead of being cut at 6. */
export const CODE_INPUT_MAX = CODE_LENGTH + 2;
/** The backend allows one code email a minute (supabase/config.toml), so the resend button waits too. */
export const RESEND_SECONDS = 60;

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** Deliberately loose: the server decides who is invited; this only catches typos. */
export const isValidEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());

/** Keeps digits only (people paste "123 456"), at most six. */
export const cleanOtp = (raw: string) => raw.replace(/\D/g, '').slice(0, CODE_LENGTH);

export const isCompleteOtp = (code: string) => code.length === CODE_LENGTH;

/** Whole seconds until the next code may be requested (0 = now). */
export const secondsLeft = (sentAt: number, now: number, cooldown = RESEND_SECONDS) =>
  Math.max(0, Math.ceil(cooldown - (now - sentAt) / 1000));

/** The content key explaining a failed sign-in step. `demo` is the password button, whose failure means something else. */
export function signInErrorKey(err: unknown, demo = false): string {
  if (isNetworkError(err)) return 'signin.err.network';
  switch (apiCode(err)) {
    case 'auth_not_invited':
      return 'signin.err.not_invited';
    case 'auth_code_invalid':
      return demo ? 'signin.err.demo' : 'signin.err.code_invalid';
    case 'auth_rate_limited':
      return 'signin.err.rate_limited';
    default:
      return 'signin.err.unknown';
  }
}
