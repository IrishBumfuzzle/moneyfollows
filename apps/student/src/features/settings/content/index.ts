// Settings strings. Same per-feature pattern as main/classroom (CLAUDE.md 12).
import en from './en.json';
import hi from './hi.json';
import type { Lang } from '../../onboarding/types';

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a key with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en?.[key] ?? key;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}
