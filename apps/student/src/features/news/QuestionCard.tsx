import { formatRupees, t } from './content';
import { useNews } from './useNews';
import type { Article, Lang } from './types';

export interface Payment {
  wage: number;
  half: boolean;
  from: HTMLElement | null;   // where the coins fly from
}

/** The one question at the end of an article (CLAUDE.md 5.8). */
export function QuestionCard({ lang, article, onPaid }: {
  lang: Lang;
  article: Article;
  onPaid: (p: Payment) => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const progress = useNews((s) => s.progress[article.edition]?.[article.id]);
  const answer = useNews((s) => s.answer);
  const q = article.question;
  const picks = progress?.picks ?? [];
  const done = progress?.done ?? false;
  const answered = picks.length > 0;

  function pick(i: number, el: HTMLElement) {
    const r = answer(article, i);
    if (r && r.paid > 0) onPaid({ wage: r.paid, half: r.attempt === 2, from: el });
  }

  const optionClass = (i: number) => {
    if (done && i === q.correct) return 'is-correct';
    if (picks.includes(i)) return i === q.correct ? 'is-correct' : 'is-wrong';
    return done ? 'is-dim' : '';
  };

  let verdict: string | null = null;
  if (answered) verdict = progress?.correct ? 'news.ui.correct' : 'news.ui.wrong';

  return (
    <section className="nt-question" aria-labelledby={`nt-q-${article.id}`}>
      <p className="nt-kicker">{tr('news.ui.question')}</p>
      <h3 id={`nt-q-${article.id}`} className="nt-q-prompt">{tr(q.prompt)}</h3>
      {!answered && <p className="nt-q-wage">{tr('news.ui.wage', { wage: formatRupees(article.reward.wage) })}</p>}
      <div className="nt-options" role="group" aria-label={tr(q.prompt)}>
        {q.options.map((o, i) => (
          <button
            key={o}
            className={`k-btn nt-option ${optionClass(i)}`}
            disabled={done || picks.includes(i)}
            onClick={(e) => pick(i, e.currentTarget)}
          >
            <span className="nt-letter" aria-hidden="true">{'ABCD'[i]}</span>
            <span>{tr(o)}</span>
          </button>
        ))}
      </div>
      {answered && (
        <div className="k-panel nt-feedback" role="status">
          <p className={`nt-verdict ${progress?.correct ? 'is-right' : 'is-wrong'}`}>{verdict && tr(verdict)}</p>
          <p>{tr(q.explanation)}</p>
          {!done && <p className="nt-hint">{tr('news.ui.retry')}</p>}
          {done && !progress?.correct && <p className="nt-hint">{tr('news.ui.answer_was')} {tr('news.ui.no_wage')}</p>}
          {done && progress?.correct && progress.wage > 0 && (
            <p className="nt-hint">
              {tr(picks.length === 1 ? 'news.ui.paid' : 'news.ui.paid_half', { wage: `+${formatRupees(progress.wage)}` })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
