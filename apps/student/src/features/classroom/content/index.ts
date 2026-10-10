// Classroom content: the question bank and its quiz.classroom.* strings come from BE-1's content
// pack (@paisa/content, quizzes/classroom.json); only the classroom's UI strings live here.
import { content, i18n } from '@paisa/content';
import type { Lang, QuizQuestion, TKey } from '@paisa/shared';
import en from './en.json';
import hi from './hi.json';

export { CONTENT_VERSION } from '@paisa/content';

export const CLASSROOM_BANK: QuizQuestion[] = content.quizzes.filter((q: QuizQuestion) => q.quiz === 'classroom');
/** The start- and end-of-term checks (learning_gain); startQuiz picks one set by `kind`. */
export const ASSESSMENT_BANK: QuizQuestion[] = content.quizzes.filter((q: QuizQuestion) => q.quiz === 'baseline' || q.quiz === 'endline');

const pack = i18n as Partial<Record<Lang, Record<string, string>>>;

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = {
  en: { ...pack.en, ...en },
  hi: { ...pack.hi, ...hi },
};

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: TKey | string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}
