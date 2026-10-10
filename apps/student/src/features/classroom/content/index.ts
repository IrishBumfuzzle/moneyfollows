// Classroom content pack. Lives here until packages/content (origin/Backend) is on main;
// then move questions.json into packages/content/quizzes/classroom.json and the strings
// into packages/content/i18n/{en,hi}.json (keys unchanged).
import questions from './questions.json';
import en from './en.json';
import hi from './hi.json';
import type { Lang, QuizQuestion, TKey } from '../types';

export const CLASSROOM_BANK = questions as QuizQuestion[];
export const CONTENT_VERSION = 'classroom-2026-10-10';

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = { en, hi };

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: TKey | string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}
