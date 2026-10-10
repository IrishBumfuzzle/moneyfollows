import { Fragment, useEffect, useRef } from 'react';
import { parseBody } from './body';
import { getTerm, t } from './content';
import { QuestionCard } from './QuestionCard';
import type { Payment } from './QuestionCard';
import type { Article, Lang } from './types';

/** One article: headline, body with tappable glossary words, and its question. */
export function ArticleView({ lang, article, index, onWord, onPaid }: {
  lang: Lang;
  article: Article;
  index: number;
  onWord: (termId: string, anchor: HTMLElement) => void;
  onPaid: (p: Payment) => void;
}) {
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    headRef.current?.focus();
  }, [article.id]);

  return (
    <article className="nt-article">
      <p className="nt-kicker">{t(lang, 'news.ui.story', { n: index + 1 })}</p>
      <h2 ref={headRef} tabIndex={-1} className="nt-headline">{t(lang, article.headline)}</h2>
      <div className="nt-figure" aria-hidden="true">
        <span className="nt-figure-num">{index + 1}</span>
      </div>
      <p className="nt-body">
        {parseBody(t(lang, article.body)).map((seg, i) =>
          seg.kind === 'text' ? (
            <Fragment key={i}>{seg.text}</Fragment>
          ) : (
            <GlossaryWord key={i} lang={lang} termId={seg.termId} onOpen={onWord} />
          ),
        )}
      </p>
      <hr className="nt-rule" />
      <QuestionCard lang={lang} article={article} onPaid={onPaid} />
    </article>
  );
}

/** A [[termId]] word: dotted marigold underline, a real button with a 48 px tap area. */
export function GlossaryWord({ lang, termId, onOpen }: {
  lang: Lang;
  termId: string;
  onOpen: (termId: string, anchor: HTMLElement) => void;
}) {
  const term = getTerm(termId);
  if (!term) return null;
  return (
    <button className="nt-word" aria-haspopup="dialog" onClick={(e) => onOpen(termId, e.currentTarget)}>
      {t(lang, term.word)}
    </button>
  );
}
