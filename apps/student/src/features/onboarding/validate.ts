export const CODE_MAX = 12;
export const NICKNAME_MAX = 16;

/** Class codes are A–Z and 0–9; anything else (spaces, dashes) is dropped. Used for ?code= too. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_MAX);
}

/** Letters (any script, with combining marks, so Hindi matras survive) and digits, 1–16 of them. */
export function isValidNickname(raw: string): boolean {
  return new RegExp(`^[\\p{L}\\p{M}\\p{N}]{1,${NICKNAME_MAX}}$`, 'u').test(raw.trim());
}
