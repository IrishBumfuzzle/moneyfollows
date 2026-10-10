// Per-feature strings (CLAUDE.md decision 2026-10-11): each screen keeps content/en.json and
// content/hi.json with the same keys, and builds its own t() with makeT.
export type Lang = 'en' | 'hi';
export const LANGS: readonly Lang[] = ['en', 'hi'];

export type Dict = Record<string, string>;
export type T = (lang: Lang, key: string, vars?: Record<string, string | number>) => string;

/** A t() over one feature's dictionaries: falls back to English, then the key; fills {{var}}. */
export function makeT(dicts: Partial<Record<Lang, Dict>>): T {
  return (lang, key, vars = {}) => {
    const s = dicts[lang]?.[key] ?? dicts.en?.[key] ?? key;
    return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
  };
}

const LANG_KEY = 'paisa.dashboard.lang';

export function savedLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l === 'en' || l === 'hi') return l;
  } catch {
    // storage blocked: fall through to the default
  }
  return 'en';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
}
