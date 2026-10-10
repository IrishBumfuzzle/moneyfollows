// Concepts and real-life guides come from BE-1's content pack (@paisa/content), with their
// concept.* / guide.* strings. Notebook entries reuse the lesson strings of the events feature and
// the classroom questions. Only the Learn screen's own UI strings live here.
import { concepts, content, guides, i18n } from '@paisa/content';
import type { Concept, Guide, Lang, QuizQuestion } from '@paisa/shared';
import { STRINGS as EVENT_STRINGS } from '../../events/content';
import en from './en.json';
import hi from './hi.json';

const pack = i18n as Partial<Record<Lang, Record<string, string>>>;

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = {
  en: { ...EVENT_STRINGS.en, ...pack.en, ...en },
  hi: { ...EVENT_STRINGS.hi, ...pack.hi, ...hi },
};

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

export const CONCEPTS: readonly Concept[] = concepts;
export const GUIDES: readonly Guide[] = guides;

export const conceptById = new Map(concepts.map((c) => [c.id, c]));

const questions = new Map<string, QuizQuestion>(content.quizzes.map((q) => [q.id, q]));
/** A baseline, end-line or classroom question by id. */
export const questionById = (id: string): QuizQuestion | undefined => questions.get(id);
