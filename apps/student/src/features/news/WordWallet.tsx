import { getTerm, t } from './content';
import { useWordWallet } from './useWordWallet';
import type { Lang } from './types';

/**
 * Every word the player has tapped, newest first; each reopens its thought cloud. Exported so
 * the Notes screen (owner to be decided) can render it too.
 */
export function WordWallet({ lang, onWord }: {
  lang: Lang;
  onWord: (termId: string, articleId: string, anchor: HTMLElement) => void;
}) {
  const words = useWordWallet((s) => s.words);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);

  return (
    <section className="nt-wallet" aria-labelledby="nt-wallet-title">
      <h2 id="nt-wallet-title" className="nt-headline" tabIndex={-1}>{tr('news.ui.wordwallet.title')}</h2>
      <p className="nt-progress">
        {words.length === 1 ? tr('news.ui.wordwallet.count_one') : tr('news.ui.wordwallet.count', { n: words.length })}
      </p>
      {words.length === 0 ? (
        <p className="nt-empty">{tr('news.ui.wordwallet.empty')}</p>
      ) : (
        <ul className="nt-wallet-list">
          {words.map((w) => {
            const term = getTerm(w.termId);
            if (!term) return null;
            return (
              <li key={w.termId}>
                <button className="nt-wallet-item" aria-haspopup="dialog" onClick={(e) => onWord(w.termId, w.articleId, e.currentTarget)}>
                  <span className="nt-wallet-word">{tr(term.word)}</span>
                  <span className="nt-wallet-simple">{tr(term.simple)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
