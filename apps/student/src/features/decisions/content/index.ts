// Decision strings: the scenarios, events, speakers and lessons come from BE-1's content pack
// (@paisa/content i18n); only the scene's own UI strings live here.
import { i18n } from '@paisa/content';
import type { Lang, TKey } from '@paisa/shared';
import en from './en.json';
import hi from './hi.json';

export type { Lang } from '@paisa/shared';

/** This feature's own strings, for the en/hi parity test. */
export const OWN: Partial<Record<Lang, Record<string, string>>> = { en, hi };

const pack = i18n as Partial<Record<Lang, Record<string, string>>>;
const STRINGS: Partial<Record<Lang, Record<string, string>>> = {
  en: { ...pack.en, ...en },
  hi: { ...pack.hi, ...hi },
};

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: TKey | string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

const INR = new Intl.NumberFormat('en-IN');

/** ₹ with Indian grouping in every language (CLAUDE.md 5.7). */
export const rupees = (n: number) => `${n < 0 ? '−' : ''}₹${INR.format(Math.abs(n))}`;

/** A signed money change: 200 → "+₹200", -100 → "−₹100". */
export const signedRupees = (n: number) => (n > 0 ? `+${rupees(n)}` : rupees(n));
