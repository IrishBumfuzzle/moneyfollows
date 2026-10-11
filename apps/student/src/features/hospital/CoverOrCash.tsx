import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelIcon } from '../life/PixelIcon';
import { rupees, t } from './content';
import type { Lang } from './content';
import {
  COPAY_PCT,
  LOAN_EXTRA_PCT,
  PREMIUM,
  YEARLY_SAVING,
  YEARS,
  coverLesson,
  dealSeason,
  otherPath,
  playSeason,
  playYear,
  startSeason,
} from './cover';
import type { Season, Year, YearResult } from './cover';
import { BackButton } from './BackButton';
import '../../design/kenney.css';
import '../life/life.css'; // the 'Paisa Digits' face
import '../store/counter.css';
import './hospital.css';

type Phase = 'intro' | 'choose' | 'year' | 'done';
type Tr = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The hospital's health-cover mini-game: three years, each starting with one choice, buy a year
 * of Health Shield or keep the premium. Practice only; `onFinish` reports the result for the
 * tracker and nothing touches the story's wallet.
 */
export function CoverOrCash({ lang, seed, onFinish, onExit }: {
  lang: Lang;
  seed: number;
  /** Called once at the end, with the choices made (true = bought cover). */
  onFinish: (result: { choices: boolean[]; savings: number; debt: number }) => void;
  onExit: () => void;
}) {
  const tr: Tr = (key, vars) => t(lang, key, vars);
  const years = useMemo(() => dealSeason(seed), [seed]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [season, setSeason] = useState<Season>(startSeason);
  const headRef = useRef<HTMLHeadingElement>(null);

  const done = season.results.length;
  const index = phase === 'year' ? done - 1 : done; // the year on screen

  useEffect(() => {
    headRef.current?.focus();
  }, [phase, index]);

  function choose(bought: boolean) {
    setSeason((s) => playYear(s, years[index]!, bought));
    setPhase('year');
  }

  function next() {
    if (done < YEARS) return setPhase('choose');
    setPhase('done');
    onFinish({ choices: season.results.map((r) => r.bought), savings: season.savings, debt: season.debt });
  }

  return (
    <div className="ct-screen" lang={lang}>
      <div className="ct-card k-panel">
        <div className="ct-head">
          <BackButton label={tr('hospital.back')} onClick={onExit} />
          <h1 className="k-banner ct-title">{tr('cover.title')}</h1>
          <span className="hp-wallet">
            <span>{tr('cover.savings', { money: rupees(season.savings) })}</span>
            {season.debt > 0 && <span className="kr-over">{tr('cover.owe', { money: rupees(season.debt) })}</span>}
          </span>
        </div>

        {phase !== 'intro' && phase !== 'done' && (
          <ol className="ct-pips" aria-label={tr('cover.year', { n: index + 1, total: YEARS })}>
            {years.map((_, i) => (
              <li key={i} className={`k-pip ${i < done && i !== index ? 'is-right' : i === index ? 'is-now' : ''}`} />
            ))}
          </ol>
        )}

        {phase === 'intro' && (
          <section className="ct-body">
            <h2 ref={headRef} tabIndex={-1}>{tr('cover.intro.title')}</h2>
            <p>{tr('cover.intro.body', { saving: rupees(YEARLY_SAVING), premium: rupees(PREMIUM) })}</p>
            <PolicyCard tr={tr} />
            <p className="ct-note">{tr('cover.intro.loan', { pct: LOAN_EXTRA_PCT })}</p>
            <ul className="hp-terms">
              <li>{tr('cover.term.premium')}</li>
              <li>{tr('cover.term.copay')}</li>
            </ul>
            <button className="k-btn is-primary ct-main" onClick={() => setPhase('choose')}>
              {tr('cover.start')}
            </button>
          </section>
        )}

        {phase === 'choose' && (
          <section className="ct-body">
            <h2 ref={headRef} tabIndex={-1}>{tr('cover.year', { n: index + 1, total: YEARS })}</h2>
            <p>{tr('cover.year.income', { money: rupees(YEARLY_SAVING) })}</p>
            {season.debt > 0 && (
              <p className="kr-over">{tr('cover.year.repaid', { money: rupees(Math.min(season.debt, YEARLY_SAVING)) })}</p>
            )}
            <PolicyCard tr={tr} />
            <div className="lf-offers">
              <button className="k-btn lf-offer" onClick={() => choose(true)}>
                <span className="lf-offer-icon"><PixelIcon id="cross" size={32} /></span>
                <span className="lf-offer-body">
                  <span className="lf-offer-label">{tr('cover.buy', { money: rupees(PREMIUM) })}</span>
                  <span className="lf-offer-hint">{tr('cover.buy.hint', { copay: COPAY_PCT })}</span>
                </span>
              </button>
              <button className="k-btn lf-offer" onClick={() => choose(false)}>
                <span className="lf-offer-icon"><PixelIcon id="coin" size={32} /></span>
                <span className="lf-offer-body">
                  <span className="lf-offer-label">{tr('cover.skip', { money: rupees(PREMIUM) })}</span>
                  <span className="lf-offer-hint">{tr('cover.skip.hint')}</span>
                </span>
              </button>
            </div>
          </section>
        )}

        {phase === 'year' && (
          <YearView
            lang={lang}
            tr={tr}
            year={years[index]!}
            result={season.results[index]!}
            other={otherPath(season, years, index)}
            headRef={headRef}
            last={done === YEARS}
            onNext={next}
          />
        )}

        {phase === 'done' && <DoneView tr={tr} years={years} season={season} headRef={headRef} onExit={onExit} />}
      </div>
    </div>
  );
}

function PolicyCard({ tr }: { tr: Tr }) {
  return (
    <section className="ct-bill hp-policy" aria-labelledby="hp-cover-policy">
      <h3 id="hp-cover-policy" className="hp-policy-title">
        <PixelIcon id="cross" size={24} />
        {tr('cover.rule.title')}
      </h3>
      <ul className="hp-rules">
        <li className="hp-yes">{tr('cover.rule.stay', { shield: 100 - COPAY_PCT, copay: COPAY_PCT })}</li>
        <li className="hp-no">{tr('cover.rule.opd')}</li>
      </ul>
      <p className="hp-made-up">{tr('hospital.made_up')}</p>
    </section>
  );
}

function YearView({ lang, tr, year, result, other, headRef, last, onNext }: {
  lang: Lang;
  tr: Tr;
  year: Year;
  result: YearResult;
  /** The same year played with the other choice. */
  other: YearResult;
  headRef: React.RefObject<HTMLHeadingElement>;
  last: boolean;
  onNext: () => void;
}) {
  const monthName = (m: number) =>
    new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short' }).format(new Date(2026, m - 1, 1));
  const covered = new Set(result.lines.filter((l) => l.covered).map((l) => l.month));
  return (
    <section className="ct-body">
      <h2 ref={headRef} tabIndex={-1}>
        {tr(result.bought ? 'cover.chose.bought' : 'cover.chose.skipped', { money: rupees(PREMIUM) })}
      </h2>
      <h3 className="hp-sub">{tr('cover.months')}</h3>
      <ol className="hp-months">
        {year.months.map((bill, i) => {
          const m = i + 1;
          const label = bill
            ? tr('cover.month.bill', { month: monthName(m), bill: tr(`cover.bill.${bill.id}`), money: rupees(bill.cost) })
            : tr('cover.month.none', { month: monthName(m) });
          const kind = !bill ? '' : covered.has(m) ? 'is-covered' : bill.care === 'hospital' ? 'is-big' : 'is-bill';
          return (
            <li key={m} className={`hp-month ${kind}`} style={{ '--i': i } as React.CSSProperties} aria-label={label}>
              <span className="hp-month-name" aria-hidden="true">{monthName(m)}</span>
              {bill && (
                <span aria-hidden="true">
                  <PixelIcon id={bill.care === 'hospital' ? 'cross' : 'bandage'} size={16} />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="ct-bill">
        <ul className="hp-lines">
          {result.lines.map((l) => (
            <li key={l.month}>
              <span className="hp-line-what">
                {monthName(l.month)} · {tr(`cover.bill.${l.bill.id}`)}
                <span className="ct-num">{rupees(l.bill.cost)}</span>
              </span>
              <span className={l.covered ? 'kr-got' : 'ct-note'}>
                {l.covered
                  ? tr('cover.line.covered', { shield: rupees(l.shieldPays), you: rupees(l.youPay) })
                  : result.bought
                    ? tr('cover.line.not_covered', { you: rupees(l.youPay) })
                    : tr('cover.line.yours', { you: rupees(l.youPay) })}
              </span>
            </li>
          ))}
        </ul>
        <dl className="hp-sum">
          <dt>{tr('cover.sum.premium')}</dt>
          <dd className="ct-num">{rupees(result.premium)}</dd>
          <dt>{tr('cover.sum.you')}</dt>
          <dd className="ct-num">{rupees(result.youPaid)}</dd>
          {result.bought && (
            <>
              <dt>{tr('cover.sum.shield')}</dt>
              <dd className="ct-num kr-got">{rupees(result.shieldPaid)}</dd>
            </>
          )}
          {result.borrowed > 0 && (
            <>
              <dt>{tr('cover.sum.borrowed')}</dt>
              <dd className="ct-num kr-over">{rupees(result.borrowed)}</dd>
            </>
          )}
          <dt className="hp-sum-total">{tr('cover.sum.savings')}</dt>
          <dd className="ct-num hp-sum-total">{rupees(result.savings)}</dd>
          {result.debt > 0 && (
            <>
              <dt>{tr('cover.sum.owe', { pct: LOAN_EXTRA_PCT })}</dt>
              <dd className="ct-num kr-over">{rupees(result.debt)}</dd>
            </>
          )}
        </dl>
      </div>

      <p className="ct-feedback k-panel">
        {tr(result.bought ? 'cover.other.bought' : 'cover.other.skipped', {
          premium: rupees(PREMIUM),
          savings: rupees(other.savings),
          debt: rupees(other.debt),
        })}
      </p>
      <button className="k-btn is-primary ct-main" onClick={onNext}>
        {tr(last ? 'cover.finish' : 'cover.next')}
      </button>
    </section>
  );
}

function DoneView({ tr, years, season, headRef, onExit }: {
  tr: Tr;
  years: Year[];
  season: Season;
  headRef: React.RefObject<HTMLHeadingElement>;
  onExit: () => void;
}) {
  const always = playSeason(years, years.map(() => true));
  const never = playSeason(years, years.map(() => false));
  const lesson = coverLesson(years, season);
  const big = years.findIndex((y) => y.kind === 'big');
  const stay = years[big]!.months.find((b) => b?.care === 'hospital')!;
  const shield = season.results[big]!.shieldPaid;
  const rows = [
    ['cover.path.you', season],
    ['cover.path.always', always],
    ['cover.path.never', never],
  ] as const;
  return (
    <section className="ct-body">
      <h2 ref={headRef} tabIndex={-1}>{tr('cover.done.title')}</h2>
      <table className="ct-bill hp-paths">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">{tr('cover.col.savings')}</th>
            <th scope="col">{tr('cover.col.owe')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, s]) => (
            <tr key={key} className={key === 'cover.path.you' ? 'is-you' : ''}>
              <th scope="row">{tr(key)}</th>
              <td className="ct-num">{rupees(s.savings)}</td>
              <td className={`ct-num ${s.debt > 0 ? 'kr-over' : ''}`}>{rupees(s.debt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ct-feedback k-panel">
        {tr(`cover.lesson.${lesson}`, {
          shield: rupees(shield),
          bill: rupees(stay.cost),
          copay: rupees(Math.round((stay.cost * COPAY_PCT) / 100)),
        })}
      </p>
      <p>{tr('cover.lesson.pool')}</p>
      <button className="k-btn is-primary ct-main" onClick={onExit}>
        {tr('hospital.done')}
      </button>
    </section>
  );
}
