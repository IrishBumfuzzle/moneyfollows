// Main screen strings. Same per-feature pattern as classroom/onboarding (CLAUDE.md 12).
import en from './en.json';
import hi from './hi.json';
import type { Lang } from '../../onboarding/types';

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a key with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

const INR = new Intl.NumberFormat('en-IN');
export const formatRupees = (n: number) => `₹${INR.format(n)}`;
