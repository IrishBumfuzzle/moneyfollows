// Bank strings (Bank sheet, Time Machine, Jar Splitter). Per-feature like the other features.
// Jar Splitter rounds (story, lesson, check lines) come from BE-1's content pack (jar.* keys).
import { i18n } from '@paisa/content';
import type { Lang } from '@paisa/shared';
import en from './en.json';
import hi from './hi.json';

export type { Lang };

const pack = i18n as Partial<Record<Lang, Record<string, string>>>;

/** This feature's own strings (the key-parity test checks these). */
export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a `t:` key (or bare key) with {{var}} substitution: own strings, then the content pack, then English. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? pack[lang]?.[k] ?? STRINGS.en?.[k] ?? pack.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

const INR = new Intl.NumberFormat('en-IN');
/** ₹ with Indian grouping in every language (CLAUDE.md 5.7). */
export const formatRupees = (n: number) => `₹${INR.format(n)}`;
/** Indian grouping without ₹, for strings that already print the ₹ sign. */
export const grouped = (n: number) => INR.format(n);
