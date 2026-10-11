// Bank strings (Bank sheet, Time Machine). Per-feature like the other features.
import en from './en.json';
import hi from './hi.json';
import type { Lang } from '@paisa/shared';

export type { Lang };

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a key with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en?.[key] ?? key;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

const INR = new Intl.NumberFormat('en-IN');
/** ₹ with Indian grouping in every language (CLAUDE.md 5.7). */
export const formatRupees = (n: number) => `₹${INR.format(n)}`;
