import { useEffect, useRef, useState } from 'react';
import { projectGrowth } from '@paisa/engine';
import { GROWTH_RATES } from '@paisa/shared';
import { AssumptionBanner } from './AssumptionBanner';
import { formatRupees, t } from './content';
import type { Lang } from './content';
import { GrowthChart } from './GrowthChart';
import { TimeSlider } from './TimeSlider';
import { CHALLENGES, MONTHLY, YEARS, answer, putIn, rangeAt, scoreRound } from './timeMachine';
import type { RoundResult } from './timeMachine';
import '../../design/kenney.css';
import '../life/life.css'; // the 'Paisa Digits' face
import './bank.css';

type Phase = { name: 'explore' } | { name: 'quiz'; index: number; picks: ('a' | 'b')[] } | { name: 'done'; result: RoundResult };

const pct = (r: number) => Math.round(r * 1000) / 10;

/**
 * The Time Machine at the Bank (CLAUDE.md 5.4, 7.2 rules 4–5): sliders for a monthly amount
 * and years, the low/average/high range from projectGrowth, and the AssumptionBanner, always
 * visible. Then a 3-question round. Practice only: it never touches the wallet.
 */
export function TimeMachine({ lang, onFinish, onExit }: {
  lang: Lang;
  /** Called once per finished round. */
  onFinish: (result: RoundResult) => void;
  onExit: () => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [monthly, setMonthly] = useState<number>(MONTHLY.start);
  const [years, setYears] = useState<number>(YEARS.start);
  const [phase, setPhase] = useState<Phase>({ name: 'explore' });
  const headRef = useRef<HTMLHeadingElement>(null);
  const rates = GROWTH_RATES;

  useEffect(() => {
    if (phase.name !== 'explore') headRef.current?.focus();
  }, [phase]);

  const projection = projectGrowth(monthly, years, rates);
  const end = rangeAt(projection, years);
  const labels = {
    low: tr('tm.low', { rate: pct(rates.low) }),
    avg: tr('tm.avg', { rate: pct(rates.avg) }),
    high: tr('tm.high', { rate: pct(rates.high) }),
    summary: tr('tm.summary', { n: years, low: formatRupees(end.low), high: formatRupees(end.high) }),
  };

  function pick(choice: 'a' | 'b') {
    if (phase.name !== 'quiz' || phase.picks[phase.index] !== undefined) return;
    const picks = [...phase.picks];
    picks[phase.index] = choice;
    setPhase({ ...phase, picks });
  }

  function next() {
    if (phase.name !== 'quiz') return;
    if (phase.index < CHALLENGES.length - 1) return setPhase({ ...phase, index: phase.index + 1 });
    const result = scoreRound(phase.picks, rates);
    setPhase({ name: 'done', result });
    onFinish(result);
  }

  return (
    <div className="bk-screen" lang={lang}>
      <div className="bk-card k-panel">
        <div className="bk-head">
          <button className="k-round" onClick={onExit} aria-label={tr('tm.back')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
            </svg>
          </button>
          <h1 className="k-banner bk-title">{tr('tm.title')}</h1>
        </div>

        {phase.name === 'explore' && (
          <section className="bk-body">
            <p>{tr('tm.intro')}</p>
            <TimeSlider
              label={tr('tm.monthly', { amount: formatRupees(monthly) })}
              valueText={formatRupees(monthly)}
              value={monthly}
              {...MONTHLY}
              onChange={setMonthly}
            />
            <TimeSlider
              label={years === 1 ? tr('tm.years_one') : tr('tm.years', { n: years })}
              valueText={String(years)}
              value={years}
              {...YEARS}
              onChange={setYears}
            />
            <AssumptionBanner text={tr('tm.assumption')} />
            <GrowthChart projection={projection} labels={labels} format={formatRupees} />
            <p className="bk-note">{tr('tm.put_in', { amount: formatRupees(monthly * 12 * years) })}</p>
            <p className="bk-note">{tr('tm.what')}</p>
            <p className="bk-small">{tr('tm.assets')}</p>
            <button className="k-btn is-primary bk-main" onClick={() => setPhase({ name: 'quiz', index: 0, picks: [] })}>
              {tr('tm.play')}
            </button>
          </section>
        )}

        {phase.name === 'quiz' && (() => {
          const c = CHALLENGES[phase.index]!;
          const picked = phase.picks[phase.index];
          const right = answer(c, rates);
          const ra = rangeAt(projectGrowth(c.a.monthly, c.a.years, rates), c.a.years);
          const rb = rangeAt(projectGrowth(c.b.monthly, c.b.years, rates), c.b.years);
          const plan = (k: 'a' | 'b') => {
            const p = c[k];
            const cls = picked === undefined ? '' : k === right ? 'is-correct' : k === picked ? 'is-wrong' : 'is-dim';
            return (
              <button key={k} className={`k-btn bk-plan ${cls}`} onClick={() => pick(k)} aria-pressed={picked === k} disabled={picked !== undefined}>
                <span className="bk-plan-name">{tr(`tm.q.${k}`)}</span>
                <span>{tr('tm.q.plan', { monthly: formatRupees(p.monthly), years: p.years })}</span>
                <span className="bk-small">{tr('tm.q.put_in', { amount: formatRupees(putIn(p)) })}</span>
              </button>
            );
          };
          return (
            <section className="bk-body">
              <h2 ref={headRef} tabIndex={-1}>{tr('tm.q.title', { n: phase.index + 1, total: CHALLENGES.length })}</h2>
              <p>{tr('tm.q.ask')}</p>
              <div className="bk-plans">{plan('a')}{plan('b')}</div>
              {picked !== undefined && (
                <div className="bk-feedback k-panel" role="status">
                  <p className="bk-feedback-title">{tr(picked === right ? 'tm.q.right' : 'tm.q.wrong')}</p>
                  <p>{tr(`tm.q.why.${c.id}`)}</p>
                  <p className="bk-small">
                    {tr('tm.q.ranges', {
                      aLow: formatRupees(ra.low),
                      aHigh: formatRupees(ra.high),
                      bLow: formatRupees(rb.low),
                      bHigh: formatRupees(rb.high),
                    })}
                  </p>
                  <button className="k-btn is-primary bk-main" onClick={next}>
                    {tr(phase.index < CHALLENGES.length - 1 ? 'tm.q.next' : 'tm.q.finish')}
                  </button>
                </div>
              )}
              <AssumptionBanner text={tr('tm.assumption')} />
            </section>
          );
        })()}

        {phase.name === 'done' && (
          <section className="bk-body bk-done">
            <h2 ref={headRef} tabIndex={-1}>{tr('tm.done.title')}</h2>
            <p>{tr('tm.done.score', { correct: phase.result.correct, total: phase.result.total })}</p>
            <p>{tr('tm.done.lesson')}</p>
            <AssumptionBanner text={tr('tm.assumption')} />
            <button className="k-btn bk-main" onClick={() => setPhase({ name: 'explore' })}>{tr('tm.done.again')}</button>
            <button className="k-btn is-primary bk-main" onClick={onExit}>{tr('tm.done.back')}</button>
          </section>
        )}
      </div>
    </div>
  );
}
