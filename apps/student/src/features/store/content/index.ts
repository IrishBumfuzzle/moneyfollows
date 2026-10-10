// Store strings (Counter Shift). Per-feature like the other features; move into
// packages/content/i18n/{en,hi}.json (keys unchanged) when the team consolidates.
import en from './en.json';
import hi from './hi.json';
import type { Lang } from '../../life/content';

export type { Lang } from '../../life/content';
export { rupees } from '../../life/content';

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a key with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en?.[key] ?? key;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}
