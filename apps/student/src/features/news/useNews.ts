// Answers per edition, saved to IndexedDB so a reload never pays twice (CLAUDE.md 5.8).
// The wage itself goes through the game store's earn(), which is also idempotent per sourceId.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { track } from '../../api/track';
import { useGame } from '../../game/useGame';
import { idbStorage } from '../../game/storage';
import { getEdition } from './content';
import { answerArticle, sourceId, summarize } from './progress';
import type { AnswerResult, ArticleProgress } from './progress';
import type { Article } from './types';

interface NewsStore {
  /** progress[edition][articleId] */
  progress: Record<string, Record<string, ArticleProgress>>;
  /** Answers one question; pays the wage when due. Returns what happened, or null if nothing did. */
  answer: (article: Article, choice: number) => (AnswerResult & { paid: number }) | null;
  /** Forgets an edition's answers (demo panel). */
  reset: (edition: string) => void;
}

export const useNews = create<NewsStore>()(
  persist(
    (set, get) => ({
      progress: {},
      answer: (article, choice) => {
        const ed = get().progress[article.edition] ?? {};
        const r = answerArticle(ed[article.id], article, choice);
        if (!r) return null;
        const nextEd = { ...ed, [article.id]: r.progress };
        set((s) => ({ progress: { ...s.progress, [article.edition]: nextEd } }));

        const paid = r.pay > 0 && useGame.getState().earn(r.pay, sourceId(article)) ? r.pay : 0;
        track('news_question_answered', {
          edition: article.edition,
          article_id: article.id,
          correct: r.progress.correct,
          attempt: r.attempt,
        });
        const articles = getEdition().articles.filter((a) => a.edition === article.edition);
        const before = summarize(articles, ed), after = summarize(articles, nextEd);
        if (after.finished && !before.finished) {
          track('news_edition_completed', { edition: article.edition, correct_count: after.firstTry });
        }
        return { ...r, paid };
      },
      reset: (edition) =>
        set((s) => {
          const { [edition]: _dropped, ...rest } = s.progress;
          return { progress: rest };
        }),
    }),
    { name: 'paisa.news', version: 1, storage: createJSONStorage(() => idbStorage) },
  ),
);

/** True while the current edition has unanswered articles (the main screen's "New" badge). */
export function useHasUnread(): boolean {
  const ed = getEdition();
  const progress = useNews((s) => s.progress[ed.id]);
  return !summarize(ed.articles, progress ?? {}).finished;
}

/**
 * Demo panel hook (CLAUDE.md 9): makes the front page fresh again. There is one edition, so it
 * clears that edition's answers and lets its wages pay once more. Never called in normal play.
 */
export function markNewEdition(): void {
  const ed = getEdition();
  useNews.getState().reset(ed.id);
  useGame.getState().forgetEarned(`news:${ed.id}:`);
}
