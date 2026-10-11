import { useEffect, useMemo, useRef, useState } from 'react';
import type { JarId, PersonaId } from '@paisa/shared';
import { PixelIcon } from '../life/PixelIcon';
import type { IconId } from '../life/types';
import { formatRupees, grouped, t } from './content';
import type { Lang } from './content';
import { JAR_ORDER, emptySplit, roundsFor, scoreGame, scoreJarSplit, setJar } from './jars';
import type { JarSplit, JarSplitResult } from './jars';
import { TimeSlider } from './TimeSlider';
import '../../design/kenney.css';
import '../life/life.css'; // the 'Paisa Digits' face
import './bank.css';

const JAR_ICON: Record<JarId, IconId> = { needs: 'sack', wants: 'headphones', goals: 'school', savings: 'coin' };

/**
 * Jar Splitter at the Bank (CLAUDE.md 2, Should): split each payday into four jars, then check
 * the split against the round's rules. Practice only: it never touches the wallet. `onFinish`
 * is called once per finished game.
 */
export function JarSplitter({ lang, persona, onFinish, onExit }: {
  lang: Lang;
  persona: PersonaId;
  onFinish: (result: { correct: number; total: number; score: number }) => void;
  onExit: () => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const rounds = useMemo(() => roundsFor(persona), [persona]);
  const [index, setIndex] = useState(0);
  const [split, setSplit] = useState<JarSplit>(emptySplit);
  const [checked, setChecked] = useState<JarSplitResult | null>(null);
  const [results, setResults] = useState<JarSplitResult[]>([]);
  const [done, setDone] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const round = rounds[index];
  const live = round ? scoreJarSplit(round, split) : null;

  useEffect(() => {
    headRef.current?.focus();
  }, [index, done]);
  useEffect(() => {
    if (checked) resultRef.current?.scrollIntoView({ block: 'nearest' });
  }, [checked]);

  const check = () => live?.complete && setChecked(live);
  const next = () => {
    if (!checked) return;
    const all = [...results, checked];
    setResults(all);
    setChecked(null);
    setSplit(emptySplit());
    if (index < rounds.length - 1) return setIndex(index + 1);
    setDone(true);
    onFinish(scoreGame(all));
  };
  const again = () => {
    setIndex(0);
    setResults([]);
    setDone(false);
  };

  const final = scoreGame(results);
  return (
    <div className="bk-screen" lang={lang}>
      <div className="bk-card k-panel">
        <div className="bk-head">
          <button className="k-round" onClick={onExit} aria-label={tr('js.back')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
            </svg>
          </button>
          <h1 className="k-banner bk-title">{tr('js.title')}</h1>
        </div>

        {round && live && !done && (
          <section className="bk-body">
            <h2 ref={headRef} tabIndex={-1} className="bk-round">{tr('js.round', { n: index + 1, total: rounds.length })}</h2>
            <p>{tr(round.text)}</p>
            <p className="bk-income">{tr('js.income', { amount: formatRupees(round.income) })}</p>
            <ul className="js-jars">
              {JAR_ORDER.map((jar) => (
                <li key={jar} className={`js-jar is-${jar}`}>
                  <PixelIcon id={JAR_ICON[jar]} size={24} />
                  <TimeSlider
                    label={tr('js.jar.value', { jar: tr(`js.jar.${jar}`), amount: formatRupees(split[jar]) })}
                    valueText={formatRupees(split[jar])}
                    value={split[jar]}
                    min={0}
                    max={round.income}
                    step={round.step}
                    onChange={(v) => {
                      setChecked(null);
                      setSplit((s) => setJar(round, s, jar, v));
                    }}
                  />
                </li>
              ))}
            </ul>
            <p className={`bk-left ${live.complete ? 'is-done' : ''}`} aria-live="polite">
              {live.complete ? tr('js.all_placed') : tr('js.left', { amount: formatRupees(live.remaining) })}
            </p>
            {!checked && (
              <button className="k-btn is-primary bk-main" onClick={check} disabled={!live.complete}>
                {live.complete ? tr('js.check') : tr('js.place_all')}
              </button>
            )}
            {checked && (
              <div ref={resultRef} className="bk-feedback k-panel" role="status">
                <p className="bk-feedback-title">{tr('js.passed', { passed: checked.passed, total: checked.checks.length })}</p>
                <ul className="js-checks">
                  {checked.checks.map((c) => (
                    <li key={c.id} className={c.ok ? 'is-ok' : 'is-fix'}>
                      <PixelIcon id={c.ok ? 'smile' : 'warn'} />
                      <span>
                        {tr(c.feedback, {
                          amount: grouped(c.values.amount),
                          short: grouped(c.values.short),
                          percent: c.values.percent ?? '',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
                <p>{tr(round.lesson)}</p>
                {!checked.allPassed && (
                  <button className="k-btn bk-main" onClick={() => setChecked(null)}>{tr('js.retry')}</button>
                )}
                <button className="k-btn is-primary bk-main" onClick={next}>
                  {tr(index < rounds.length - 1 ? 'js.next' : 'js.finish')}
                </button>
              </div>
            )}
          </section>
        )}

        {done && (
          <section className="bk-body bk-done">
            <h2 ref={headRef} tabIndex={-1}>{tr('js.done.title')}</h2>
            <p>{tr('js.done.score', { passed: final.correct, total: final.total })}</p>
            <button className="k-btn bk-main" onClick={again}>{tr('js.done.again')}</button>
            <button className="k-btn is-primary bk-main" onClick={onExit}>{tr('js.done.back')}</button>
          </section>
        )}
      </div>
    </div>
  );
}
