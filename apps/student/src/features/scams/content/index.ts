// Scam or Safe? strings. The messages themselves (sender, lines, reasons, explanations) come from
// BE-1's content pack (@paisa/content i18n, scam.* and safe.* keys); only the game's own UI
// words live here.
import { i18n } from '@paisa/content';
import type { Lang } from '@paisa/shared';
import en from './en.json';
import hi from './hi.json';

export type { Lang };

const pack = i18n as Partial<Record<Lang, Record<string, string>>>;

export const UI_STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };
export const STRINGS: Partial<Record<Lang, Record<string, string>>> = {
  en: { ...pack.en, ...en },
  hi: { ...pack.hi, ...hi },
};

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}
