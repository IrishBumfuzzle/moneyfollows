// Article question rules (CLAUDE.md 5.8). Pure and serializable, like the engine:
// - a right first answer pays the full wage;
// - a wrong first answer shows the explanation and allows one retry;
// - a right retry pays half the wage, rounded down to whole rupees;
// - a wrong retry pays nothing and reveals the right answer;
// - an answered article never pays again.
import type { Article } from './types';

export interface ArticleProgress {
  picks: number[];     // option indexes, in the order tapped (1 or 2)
  correct: boolean;    // the last pick was right
  done: boolean;       // no more tries
  wage: number;        // rupees this article paid (0 until paid)
}

export interface AnswerResult {
  progress: ArticleProgress;
  /** Rupees to pay now; 0 if nothing is due. */
  pay: number;
  attempt: 1 | 2;
}

/** `news:<edition>:<articleId>`, the earn() sourceId (CLAUDE.md 5.8). */
export const sourceId = (a: Article) => `news:${a.edition}:${a.id}`;

/** Applies one tap. Returns null when the tap does nothing (already done, bad index, same wrong pick). */
export function answerArticle(prev: ArticleProgress | undefined, article: Article, choice: number): AnswerResult | null {
  const p = prev ?? { picks: [], correct: false, done: false, wage: 0 };
  if (p.done || !Number.isInteger(choice) || choice < 0 || choice >= article.question.options.length) return null;
  if (p.picks.includes(choice)) return null;
  const attempt = (p.picks.length + 1) as 1 | 2;
  const correct = choice === article.question.correct;
  const pay = correct ? (attempt === 1 ? article.reward.wage : Math.floor(article.reward.wage / 2)) : 0;
  const done = correct || attempt === 2;
  return { progress: { picks: [...p.picks, choice], correct, done, wage: p.wage + pay }, pay, attempt };
}

export interface EditionSummary {
  done: number;
  total: number;
  earned: number;
  firstTry: number;    // answered right on the first attempt
  finished: boolean;
}

export function summarize(articles: Article[], progress: Record<string, ArticleProgress | undefined>): EditionSummary {
  let done = 0, earned = 0, firstTry = 0;
  for (const a of articles) {
    const p = progress[a.id];
    if (!p) continue;
    earned += p.wage;
    if (p.done) done += 1;
    if (p.correct && p.picks.length === 1) firstTry += 1;
  }
  return { done, total: articles.length, earned, firstTry, finished: articles.length > 0 && done === articles.length };
}
