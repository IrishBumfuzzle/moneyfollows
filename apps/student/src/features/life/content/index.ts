// Life strings. Live here until packages/content (origin/Backend) is on main; then move them
// into packages/content/i18n/{en,hi}.json (keys unchanged).
import en from './en.json';
import hi from './hi.json';
import type { TKey } from '../types';

export type Lang = 'en' | 'hi' | 'te' | 'ur';

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: TKey | string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

const INR = new Intl.NumberFormat('en-IN');

/** ₹ with Indian grouping in every language (CLAUDE.md 5.7): 100000 → "₹1,00,000". */
export const rupees = (n: number) => `${n < 0 ? '−' : ''}₹${INR.format(Math.abs(n))}`;

/** A meter change with its sign: 3 → "+3", -8 → "−8". */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** A money change with its sign: 200 → "+₹200", -100 → "−₹100". */
export const signedRupees = (n: number) => (n > 0 ? `+${rupees(n)}` : rupees(n));
