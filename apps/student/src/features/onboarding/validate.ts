export const CODE_MAX = 12;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;
export const REJOIN_LENGTH = 6;

/** Class codes are A–Z and 0–9; anything else (spaces, dashes) is dropped. Used for ?code= too. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_MAX);
}

// Server alphabet (no 0, O, 1, I, L), so a code read off a note can't be mistyped into a valid one.
const REJOIN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Rejoin codes are 6 characters of the server alphabet; case and spaces ("abc 234") are forgiven. */
export function cleanRejoinCode(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => REJOIN_CHARS.includes(c)).join('').slice(0, REJOIN_LENGTH);
}

/** "ABC234" shown as "ABC 234": easier to copy onto paper, and screen readers say it in two parts. */
export function formatRejoinCode(code: string): string {
  return code.length === REJOIN_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export const isValidRejoinCode = (raw: string): boolean => cleanRejoinCode(raw).length === REJOIN_LENGTH;

/** Why a nickname is refused; the same two codes join_class raises, so the messages can be shared. */
export type NicknameProblem = 'invalid' | 'personal_info';

/**
 * Mirrors the server's `nickname_problem` (everything except its word blocklist, which only the
 * server holds), so a nickname that passes here is never refused for its shape. Server rules, in
 * its order: after NFKC, a phone number or email (an @ or 5+ digits, Devanagari digits count) is
 * personal info; otherwise it needs 2–20 characters of Latin letters or Devanagari plus digits and
 * space . _ -, in one script only, with at least 2 characters that aren't separators.
 */
export function nicknameProblem(raw: string): NicknameProblem | null {
  const n = raw.trim().normalize('NFKC'); // the form is sent trimmed; the server trims, then normalises
  const digits = [...n].filter((c) => /[0-9\u0966-\u096F]/.test(c)).length;
  if (n.includes('@') || digits >= 5) return 'personal_info';
  const length = [...n].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX || !/^[\u0900-\u097F A-Za-z0-9_.-]+$/.test(n)) return 'invalid';
  if (/[A-Za-z]/.test(n) && /[\u0900-\u097F]/.test(n)) return 'invalid'; // one script, no look-alike mixes
  if (n.replace(/[ _.-]/g, '').length < NICKNAME_MIN) return 'invalid'; // mostly separators
  return null;
}

export const isValidNickname = (raw: string): boolean => nicknameProblem(raw) === null;
