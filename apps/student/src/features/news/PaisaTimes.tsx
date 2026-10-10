import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '../../api/track';
import { useGame } from '../../game/useGame';
import { ArticleView } from './ArticleView';
import { formatRupees, getEdition, t } from './content';
import { NewsFrontPage } from './NewsFrontPage';
import type { Payment } from './QuestionCard';
import { ThoughtCloud } from './ThoughtCloud';
import { useWordWallet } from './useWordWallet';
import { WordWallet } from './WordWallet';
import type { Lang } from './types';
import '../../design/kenney.css';
import './news.css';

/**
 * Where inside the paper the player is. Each level is a history entry ({ screen: 'news', ... }),
 * so Android back closes a thought cloud, then the article or Word Wallet, then the paper
 * (CLAUDE.md 6). App.tsx owns `screen`; this component owns the rest.
 */
interface NewsNav {
  screen: 'news';
  article?: string;
  wallet?: boolean;
  term?: string;
}
type OpenTerm = { id: string; articleId: string; anchor: HTMLElement };

const navOf = (s: unknown): NewsNav => {
  const n = s as Partial<NewsNav> | null;
  return n?.screen === 'news' ? (n as NewsNav) : { screen: 'news' };
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Coins fly from the answer to the wallet chip. Skipped with reduced motion. */
function flyCoins(from: HTMLElement | null, to: HTMLElement | null) {
  if (!from || !to || reducedMotion() || !('animate' in HTMLElement.prototype)) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('span');
    c.className = 'nt-coin';
    c.style.left = `${a.left + a.width / 2 + (i - 2) * 10}px`;
    c.style.top = `${a.top + a.height / 2}px`;
    document.body.appendChild(c);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2 + (i - 2) * 10), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    c.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.9 },
      ],
      { duration: 700, delay: i * 60, easing: 'ease-in', fill: 'forwards' },
    ).onfinish = () => c.remove();
  }
}

export function PaisaTimes({ lang, onExit }: { lang: Lang; onExit: () => void }) {
  const edition = getEdition();
  const [nav, setNav] = useState<NewsNav>(() => navOf(window.history.state));
  const [term, setTerm] = useState<OpenTerm | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const money = useGame((s) => s.life.money);
  const last = useGame((s) => s.last);
  const addWord = useWordWallet((s) => s.add);
  const walletRef = useRef<HTMLSpanElement>(null);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);

  useEffect(() => {
    const on = (e: PopStateEvent) => {
      const n = navOf(e.state);
      setNav(n);
      if (!n.term) setTerm(null);
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const go = (n: NewsNav) => {
    window.history.pushState(n, '');
    setNav(n);
  };

  const openTerm = (id: string, articleId: string, anchor: HTMLElement) => {
    track('glossary_term_opened', { term_id: id, article_id: articleId });
    addWord(id, articleId);
    setTerm({ id, articleId, anchor });
    if (!navOf(window.history.state).term) window.history.pushState({ ...nav, term: id }, '');
    else window.history.replaceState({ ...nav, term: id }, '');
  };
  const closeTerm = useCallback(() => {
    if (navOf(window.history.state).term) window.history.back();
    else setTerm(null);
  }, []);

  const back = () => {
    if (nav.article || nav.wallet) window.history.back();
    else onExit();
  };

  const onPaid = (p: Payment) => {
    flyCoins(p.from, walletRef.current);
    const text = tr(p.half ? 'news.ui.paid_half' : 'news.ui.paid', { wage: `+${formatRupees(p.wage)}` });
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text }));
  };

  const index = edition.articles.findIndex((a) => a.id === nav.article);
  const article = index >= 0 ? edition.articles[index] : null;
  const atFront = !article && !nav.wallet;
  const moneyPop = last && last.delta.money > 0 ? last : null;

  return (
    <div className="nt-screen" lang={lang}>
      <div className="nt-topbar">
        <button
          className="k-round"
          onClick={back}
          aria-label={tr(atFront ? 'news.ui.close' : 'news.ui.back')}
        >
          <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
          </svg>
        </button>
        <span ref={walletRef} className="nt-wallet-chip" aria-label={`${tr('news.ui.wallet')}: ${formatRupees(money)}`}>
          <span className="nt-chip-coin" aria-hidden="true" />
          <span aria-hidden="true">{formatRupees(money)}</span>
          {moneyPop && (
            <span key={moneyPop.id} className="nt-chip-pop" aria-hidden="true">
              +{formatRupees(moneyPop.delta.money)}
            </span>
          )}
        </span>
      </div>

      <main className="nt-paper">
        {article ? (
          <ArticleView
            lang={lang}
            article={article}
            index={index}
            onWord={(id, anchor) => openTerm(id, article.id, anchor)}
            onPaid={onPaid}
          />
        ) : nav.wallet ? (
          <WordWallet lang={lang} onWord={openTerm} />
        ) : (
          <NewsFrontPage
            lang={lang}
            edition={edition}
            onOpen={(id) => go({ screen: 'news', article: id })}
            onWallet={() => go({ screen: 'news', wallet: true })}
          />
        )}
      </main>

      {term && <ThoughtCloud lang={lang} termId={term.id} anchor={term.anchor} onClose={closeTerm} />}

      <p className="nt-toast-slot" role="status" aria-live="polite">
        {toast && <span key={toast.id} className="nt-toast">{toast.text}</span>}
      </p>
    </div>
  );
}
