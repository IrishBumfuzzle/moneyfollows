import { editionLabel, formatRupees, t } from './content';
import { summarize } from './progress';
import { useNews } from './useNews';
import type { Edition, Lang } from './types';

/** The edition's front page: masthead, date, shift progress and the 5 headlines. */
export function NewsFrontPage({ lang, edition, onOpen, onWallet }: {
  lang: Lang;
  edition: Edition;
  onOpen: (articleId: string) => void;
  onWallet: () => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const progress = useNews((s) => s.progress[edition.id]) ?? {};
  const sum = summarize(edition.articles, progress);

  return (
    <div className="nt-front">
      <header className="nt-masthead">
        <h1 className="nt-title">{tr('news.ui.masthead')}</h1>
        <p className="nt-dateline">{editionLabel(lang, edition.id)}</p>
      </header>
      <p className="nt-shift">{tr('news.ui.shift')}</p>
      <p className="nt-progress" aria-live="polite">
        {tr('news.ui.progress', { done: sum.done, total: sum.total, earned: formatRupees(sum.earned) })}
      </p>

      {sum.finished && (
        <div className="k-panel nt-finished" role="status">
          <p className="nt-verdict is-right">{tr('news.ui.finished.title')}</p>
          <p>{tr('news.ui.finished.body', { total: sum.total, correct: sum.firstTry })}</p>
        </div>
      )}

      <ol className="nt-headlines">
        {edition.articles.map((a, i) => {
          const done = progress[a.id]?.done ?? false;
          return (
            <li key={a.id}>
              <button className="nt-card" onClick={() => onOpen(a.id)}>
                <span className="nt-card-num" aria-hidden="true">{i + 1}</span>
                <span className="nt-card-body">
                  <span className="nt-card-head">{tr(a.headline)}</span>
                  <span className={`nt-card-state ${done ? 'is-done' : ''}`}>
                    {done ? (
                      <svg viewBox="0 0 7 6" width="14" height="12" aria-hidden="true" shapeRendering="crispEdges">
                        <path fill="currentColor" d="M6 0h1v1H6zM5 1h1v1H5zM4 2h1v1H4zM0 3h1v1H0zM3 3h1v1H3zM1 4h1v1H1zM2 4h1v1H2zM2 5h1v1H2z" />
                      </svg>
                    ) : null}
                    {tr(done ? 'news.ui.done' : 'news.ui.todo')} · {formatRupees(a.reward.wage)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <button className="k-btn nt-wallet-btn" onClick={onWallet}>
        {tr('news.ui.wallet_open')}
      </button>
    </div>
  );
}
