import { lazy, Suspense, useState } from 'react';
import type { ClassScreenProps } from '../../types';
import type { Lang } from '../../i18n';
import { isDemoClass } from '../../demo';
import { formatNumber, formatPct } from '../../format';
import { ErrorBoundary } from '../../shell/ErrorBoundary';
import { t } from './content';
import {
  conceptName,
  conceptRows,
  hasNoGains,
  orderRows,
  sortStruggles,
  questionText,
  summarizeGains,
  wrongAnswer,
  type ConceptRow,
  type GainRow,
  type PackDicts,
} from './gains';
import { loadConceptMap, loadQuestionDicts } from './questions';
import { useLoad } from './useLoad';
import './gains.css';

// Recharts is the heavy part and only the chart needs it, so it loads when there is data to draw.
const GainsChart = lazy(() => import('./GainsChart'));

type CardProps = Pick<ClassScreenProps, 'api' | 'cls' | 'lang'>;

const studentsLabel = (lang: Lang, n: number) =>
  t(lang, n === 1 ? 'students.one' : 'students.other', { n: formatNumber(n) });

export function GainsScreen({ api, cls, lang }: ClassScreenProps) {
  return (
    <div className="gains stack">
      <GainsCard {...{ api, cls, lang }} />
      <ConceptsCard {...{ api, cls, lang }} />
      <StrugglesCard {...{ api, cls, lang }} />
    </div>
  );
}

function CardHead({ id, title, lang, demo }: { id: string; title: string; lang: Lang; demo: boolean }) {
  return (
    <div className="gains-head">
      <h2 id={id}>{title}</h2>
      {demo && <span className="badge demo">{t(lang, 'demo')}</span>}
    </div>
  );
}

function LoadError({ message, lang, onRetry }: { message: string; lang: Lang; onRetry: () => void }) {
  return (
    <div className="banner bad" role="alert">
      <span aria-hidden="true">⚠</span>
      <div className="stack">
        <p>{message}</p>
        <button type="button" className="btn" onClick={onRetry}>
          {t(lang, 'retry')}
        </button>
      </div>
    </div>
  );
}

const Loading = ({ lang }: { lang: Lang }) => (
  <p className="muted" role="status">
    {t(lang, 'loading')}
  </p>
);

// ---- Baseline vs end-line ----

function GainsCard({ api, cls, lang }: CardProps) {
  const { state, reload } = useLoad(() => api.learningGain(cls.id), cls.id);
  const demo = isDemoClass(cls);

  return (
    <section className="card" aria-labelledby="gains-title">
      <CardHead id="gains-title" title={t(lang, 'chart.title')} lang={lang} demo={demo} />
      {state.status === 'loading' && <Loading lang={lang} />}
      {state.status === 'error' && <LoadError message={t(lang, 'chart.error')} lang={lang} onRetry={reload} />}
      {state.status === 'ready' &&
        (hasNoGains(state.data) ? (
          <GainsEmpty lang={lang} endlineOpen={cls.endline_open} />
        ) : (
          <GainsResult rows={state.data} lang={lang} />
        ))}
    </section>
  );
}

function GainsEmpty({ lang, endlineOpen }: { lang: Lang; endlineOpen: boolean }) {
  return (
    <div className="stack">
      <div className="empty">
        <h3>{t(lang, 'empty.title')}</h3>
        <p>{t(lang, 'empty.body')}</p>
      </div>
      {!endlineOpen && (
        <div className="banner info" role="status">
          <span aria-hidden="true">ℹ</span>
          <p>{t(lang, 'empty.closed')}</p>
        </div>
      )}
    </div>
  );
}

function GainsResult({ rows, lang }: { rows: readonly GainRow[]; lang: Lang }) {
  const [showTable, setShowTable] = useState(false);
  const ordered = orderRows(rows);
  const summary = summarizeGains(rows);
  const sentence = summary
    ? t(lang, `summary.${summary.direction}`, {
        from: summary.from,
        to: summary.to,
        n: formatNumber(summary.students),
        students: studentsLabel(lang, summary.students),
      })
    : '';
  const name = (r: GainRow) => t(lang, `pillar.${r.pillar}`);

  return (
    <div>
      <p className="gains-summary">{sentence}</p>
      {/* A chart chunk that fails to load (stale deploy, dropped connection) stays inside this card. */}
      <ErrorBoundary text={t(lang, 'chart.crash')} reloadLabel={t(lang, 'chart.reload')}>
        <div className="gains-chart" role="img" aria-label={`${sentence} ${t(lang, 'chart.alt')}`}>
          <Suspense fallback={<Loading lang={lang} />}>
            <GainsChart rows={rows} lang={lang} />
          </Suspense>
        </div>
      </ErrorBoundary>

      <h3 className="gains-n-title">{t(lang, 'chart.n')}</h3>
      <ul className="gains-n">
        {ordered.map((r) => (
          <li key={r.pillar}>
            <span>{name(r)}</span>
            <strong className="nums">{studentsLabel(lang, r.n)}</strong>
          </li>
        ))}
      </ul>
      <p className="muted">{t(lang, 'chart.matched')}</p>

      <button
        type="button"
        className="btn gains-toggle"
        aria-expanded={showTable}
        aria-controls="gains-table"
        onClick={() => setShowTable((v) => !v)}
      >
        {t(lang, showTable ? 'table.hide' : 'table.show')}
      </button>
      {showTable && (
        <div className="table-wrap gains-table" id="gains-table">
          <table className="data">
            <caption className="sr-only">{t(lang, 'table.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t(lang, 'table.pillar')}</th>
                <th scope="col" className="num">
                  {t(lang, 'table.baseline')}
                </th>
                <th scope="col" className="num">
                  {t(lang, 'table.endline')}
                </th>
                <th scope="col" className="num">
                  {t(lang, 'table.n')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => (
                <tr key={r.pillar}>
                  <th scope="row">{name(r)}</th>
                  <td className="num">{formatPct(r.n > 0 ? r.baseline_avg : null)}</td>
                  <td className="num">{formatPct(r.n > 0 ? r.endline_avg : null)}</td>
                  <td className="num">{formatNumber(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- By concept: which ideas the class understands ----

function ConceptsCard({ api, cls, lang }: CardProps) {
  const { state, reload } = useLoad(async () => {
    const [rows, dicts, conceptOf] = await Promise.all([
      api.classroomQuizSummary(cls.id),
      loadQuestionDicts(),
      loadConceptMap(),
    ]);
    return { rows: conceptRows(rows, conceptOf), dicts };
  }, cls.id);

  return (
    <section className="card" aria-labelledby="concepts-title">
      <CardHead id="concepts-title" title={t(lang, 'concepts.title')} lang={lang} demo={isDemoClass(cls)} />
      {state.status === 'loading' && <Loading lang={lang} />}
      {state.status === 'error' && <LoadError message={t(lang, 'concepts.error')} lang={lang} onRetry={reload} />}
      {state.status === 'ready' && (
        <>
          <p className="muted">{t(lang, 'concepts.intro')}</p>
          {state.data.rows.length === 0 ? (
            <p className="empty">{t(lang, 'concepts.empty')}</p>
          ) : (
            <ConceptsTable rows={state.data.rows} dicts={state.data.dicts} lang={lang} />
          )}
        </>
      )}
    </section>
  );
}

function ConceptsTable({ rows, dicts, lang }: { rows: readonly ConceptRow[]; dicts: PackDicts; lang: Lang }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">{t(lang, 'concepts.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t(lang, 'concepts.concept')}</th>
            <th scope="col">{t(lang, 'struggles.pillar')}</th>
            <th scope="col" className="num">
              {t(lang, 'struggles.correct')}
            </th>
            <th scope="col" className="num">
              {t(lang, 'concepts.questions')}
            </th>
            <th scope="col" className="num">
              {t(lang, 'concepts.answers')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.concept}>
              <th scope="row" className="gains-q">
                {conceptName(dicts, lang, r.concept)}
              </th>
              <td>{t(lang, `pillar.${r.pillar}`)}</td>
              <td className="num">
                <span className="gains-meter">
                  <span className="gains-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.max(0, r.correct_pct))}%` }} />
                  </span>
                  <span className="gains-pct">{formatPct(r.correct_pct)}</span>
                </span>
              </td>
              <td className="num">{formatNumber(r.questions)}</td>
              <td className="num">{formatNumber(r.answers)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Where the class is struggling ----

function StrugglesCard({ api, cls, lang }: CardProps) {
  const { state, reload } = useLoad(async () => {
    const [rows, dicts] = await Promise.all([api.classroomQuizSummary(cls.id), loadQuestionDicts()]);
    return { rows: sortStruggles(rows), dicts };
  }, cls.id);

  return (
    <section className="card" aria-labelledby="struggles-title">
      <CardHead id="struggles-title" title={t(lang, 'struggles.title')} lang={lang} demo={isDemoClass(cls)} />
      {state.status === 'loading' && <Loading lang={lang} />}
      {state.status === 'error' && <LoadError message={t(lang, 'struggles.error')} lang={lang} onRetry={reload} />}
      {state.status === 'ready' && (
        <>
          <p className="muted">{t(lang, 'struggles.intro')}</p>
          {state.data.rows.length === 0 ? (
            <p className="empty">{t(lang, 'struggles.empty')}</p>
          ) : (
            <StrugglesTable rows={state.data.rows} dicts={state.data.dicts} lang={lang} />
          )}
        </>
      )}
    </section>
  );
}

function StrugglesTable({
  rows,
  dicts,
  lang,
}: {
  rows: ReturnType<typeof sortStruggles>;
  dicts: PackDicts;
  lang: Lang;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">{t(lang, 'struggles.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t(lang, 'struggles.question')}</th>
            <th scope="col">{t(lang, 'struggles.pillar')}</th>
            <th scope="col" className="num">
              {t(lang, 'struggles.correct')}
            </th>
            <th scope="col" className="num">
              {t(lang, 'struggles.students')}
            </th>
            <th scope="col" className="num">
              {t(lang, 'struggles.attempts')}
            </th>
            <th scope="col">{t(lang, 'struggles.wrong')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const wrong = wrongAnswer(dicts, lang, r.question_id, r.top_wrong_choice);
            return (
              <tr key={r.question_id}>
                <th scope="row" className="gains-q">
                  {questionText(dicts, lang, r.question_id)}
                </th>
                <td>{t(lang, `pillar.${r.pillar}`)}</td>
                <td className="num">
                  <span className="gains-meter">
                    <span className="gains-bar" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, Math.max(0, r.correct_pct))}%` }} />
                    </span>
                    <span className="gains-pct">{formatPct(r.correct_pct)}</span>
                  </span>
                </td>
                <td className="num">{formatNumber(r.students)}</td>
                <td className="num">{formatNumber(r.attempts)}</td>
                <td className="gains-wrong">
                  {wrong
                    ? (wrong.text ?? t(lang, 'struggles.option', { n: wrong.position }))
                    : t(lang, 'struggles.no_wrong')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
