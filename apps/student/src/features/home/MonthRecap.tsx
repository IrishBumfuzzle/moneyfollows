import { useEffect, useRef } from 'react';
import { GAME_MONTHS } from '@paisa/shared';
import type { GameState, ScoreParts } from '@paisa/shared';
import { t as packT } from '../decisions/content';
import { planReport } from '../decisions/plan';
import { t } from './content';
import type { Lang } from './content';
import '../../design/kenney.css';
import '../decisions/decisions.css';
import './home.css';

/** The score as a ring out of 100. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const tone = score >= 70 ? 'is-good' : score >= 40 ? 'is-mid' : 'is-low';
  return (
    <svg className={`hm-ring ${tone}`} viewBox="0 0 100 100" width="120" height="120" role="img" aria-label={label}>
      <circle className="hm-ring-track" cx="50" cy="50" r={r} />
      <circle
        className="hm-ring-fill"
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="58" textAnchor="middle" className="hm-ring-num">{score}</text>
    </svg>
  );
}

// Debt counts against the score, so its bar shows 1 − d: full when nothing is owed.
const PARTS: { key: keyof ScoreParts; value: (p: ScoreParts) => number }[] = [
  { key: 's', value: (p) => p.s },
  { key: 'e', value: (p) => p.e },
  { key: 'g', value: (p) => p.g },
  { key: 'd', value: (p) => 1 - p.d },
];

/**
 * The Month Recap at month end (CLAUDE.md 5.3): the Money Health Score as a ring, its four
 * parts and one thing to try next month. Continue starts the next month with payday.
 */
export function MonthRecap({ lang, plan, onContinue }: { lang: Lang; plan: GameState; onContinue: () => void }) {
  const report = planReport(plan);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const last = plan.month >= GAME_MONTHS;
  return (
    <div className="dc-overlay" lang={lang}>
      <div className="dc-sheet k-panel hm-recap" role="dialog" aria-modal="true" aria-labelledby="hm-recap-title">
        <h2 id="hm-recap-title" className="k-banner dc-title">{t(lang, 'home.recap.title', { month: plan.month })}</h2>
        <div className="hm-score">
          <ScoreRing score={report.score} label={`${t(lang, 'home.recap.score')}: ${report.score}`} />
          <p>
            <strong>{t(lang, 'home.recap.score')}</strong>
            <br />
            <span className="dc-muted">{t(lang, 'home.recap.of')}</span>
          </p>
        </div>
        <ul className="hm-parts">
          {PARTS.map(({ key, value }) => {
            const v = Math.max(0, Math.min(1, value(report.parts)));
            return (
              <li key={key}>
                <span className="hm-part-label">{t(lang, `home.recap.part.${key}`)}</span>
                <span className="hm-bar" aria-hidden="true">
                  <span className="hm-bar-fill" style={{ width: `${Math.round(v * 100)}%` }} />
                </span>
                <span className="hm-part-num">{Math.round(v * 100)}%</span>
                <span className="hm-part-hint">{t(lang, `home.recap.part.${key}.hint`)}</span>
              </li>
            );
          })}
        </ul>
        <div className="dc-lesson">
          <p className="dc-lesson-head">{t(lang, 'home.recap.try')}</p>
          <p>{packT(lang, report.reflection)}</p>
        </div>
        <button ref={ref} className="k-btn is-primary dc-wide" onClick={onContinue}>
          {t(lang, last ? 'home.recap.last' : 'home.recap.next')}
        </button>
      </div>
    </div>
  );
}
