// Onboarding strings, same pattern as features/classroom/content. Move them into
// packages/content/i18n/{en,hi}.json (keys unchanged) when react-i18next and packages/content land.
// The Hindi is a draft; a Hindi speaker should check it (CLAUDE.md 7.3).
import en from './en.json';
import hi from './hi.json';
import type { Lang } from '../types';

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

const RUPEES = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** ₹1,00,000 grouping in every language (CLAUDE.md 5.7). */
export const formatRupees = (n: number) => RUPEES.format(n);
