import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelIcon } from '../life/PixelIcon';
import { t } from './content';
import type { Lang } from './content';
import { MessageInspector } from './MessageInspector';
import { HELP_LINKS, dealGame, flagged, judge, scoreGame } from './scams';
import type { Call, GameResult, Verdict } from './scams';
import '../../design/kenney.css';
import '../life/life.css'; // the 'Paisa Digits' face
import './scams.css';

/**
 * Scam or Safe? with the Message Inspector. Plays as a full screen (route 'scams') or inside the
 * phone (`embedded`). Practice only: it never touches the wallet. `onFinish` is called once per
 * finished game.
 */
export function ScamOrSafe({ lang, seed, embedded = false, onFinish, onExit }: {
  lang: Lang;
  seed: number;
  embedded?: boolean;
  onFinish: (result: GameResult) => void;
  onExit?: () => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [game, setGame] = useState(0); // "Play again" deals a fresh game
  const rounds = useMemo(() => dealGame(seed + game), [seed, game]);
  const [index, setIndex] = useState(-1); // -1: intro
  const [inspected, setInspected] = useState<Set<number>>(new Set());
  const [calls, setCalls] = useState<Call[]>([]);
  const [result, setResult] = useState<GameResult | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const message = index >= 0 ? rounds[index] : undefined;
  const call = calls[index];

  useEffect(() => {
    (call ? nextRef : headRef).current?.focus();
  }, [index, call, result]);

  const inspect = (i: number) => setInspected((s) => new Set(s).add(i));
  const pick = (v: Verdict) => {
    if (!message || call) return;
    setCalls((cs) => [...cs, judge(message, v, inspected)]);
  };
  const next = () => {
    if (index < rounds.length - 1) {
      setIndex(index + 1);
      setInspected(new Set());
      return;
    }
    const r = scoreGame(calls);
    setResult(r);
    onFinish(r);
  };
  const again = () => {
    setGame((g) => g + 1);
    setIndex(0);
    setInspected(new Set());
    setCalls([]);
    setResult(null);
  };

  const body = (
    <>
      {index < 0 && (
        <section className="sc-body">
          <h2 ref={headRef} tabIndex={-1}>{tr('scams.title')}</h2>
          <p>{tr('scams.intro')}</p>
          <button className="k-btn is-primary sc-main" onClick={() => setIndex(0)}>{tr('scams.start')}</button>
        </section>
      )}

      {message && !result && (
        <section className="sc-body">
          <ol className="sc-pips" aria-label={tr('scams.round', { n: index + 1, total: rounds.length })}>
            {rounds.map((m, i) => {
              const c = calls[i];
              return <li key={m.id} className={`k-pip ${c ? (c.ok ? 'is-right' : 'is-wrong') : i === index ? 'is-now' : ''}`} />;
            })}
          </ol>
          <h2 ref={headRef} tabIndex={-1} className="sc-round">{tr('scams.round', { n: index + 1, total: rounds.length })}</h2>
          {!call && <p className="sc-hint">{tr('scams.inspect.hint')}</p>}
          <MessageInspector lang={lang} message={message} inspected={inspected} reveal={!!call} onInspect={inspect} />
          {!call && (
            <p className="sc-found" aria-live="polite">
              {tr('scams.inspect.found', { n: flagged(message).filter((i) => inspected.has(i)).length })}
            </p>
          )}

          {!call ? (
            <>
              <p>{tr('scams.pick')}</p>
              <div className="sc-picks">
                <button className="k-btn sc-pick" onClick={() => pick('scam')}>
                  <PixelIcon id="warn" size={24} />
                  {tr('scams.pick.scam')}
                </button>
                <button className="k-btn sc-pick" onClick={() => pick('safe')}>
                  <PixelIcon id="smile" size={24} />
                  {tr('scams.pick.safe')}
                </button>
              </div>
            </>
          ) : (
            <div className={`sc-feedback k-panel ${call.ok ? 'is-right' : 'is-wrong'}`} role="status">
              <p className="sc-feedback-title">{tr(call.ok ? 'scams.right' : 'scams.wrong')}</p>
              <p>{tr(message.verdict === 'scam' ? 'scams.was.scam' : 'scams.was.safe')}</p>
              <p>{tr(message.explanation)}</p>
              <button ref={nextRef} className="k-btn is-primary sc-main" onClick={next}>
                {tr(index < rounds.length - 1 ? 'scams.next' : 'scams.finish')}
              </button>
            </div>
          )}
        </section>
      )}

      {result && (
        <section className="sc-body sc-done">
          <h2 ref={headRef} tabIndex={-1}>{tr('scams.done.title')}</h2>
          <p className="sc-score">{tr('scams.done.score', { correct: result.correct, total: result.total })}</p>
          <p>{tr('scams.done.found', { found: result.found, flags: result.flags })}</p>
          <p className="sc-help">{tr('scams.done.help')}</p>
          <div className="sc-links">
            <a className="k-btn sc-link" href={HELP_LINKS.helpline}>{tr('scams.done.call')}</a>
            <a className="k-btn sc-link" href={HELP_LINKS.portal} target="_blank" rel="noopener noreferrer">{tr('scams.done.portal')}</a>
          </div>
          <button className="k-btn is-primary sc-main" onClick={again}>{tr('scams.done.again')}</button>
          {onExit && <button className="k-btn sc-main" onClick={onExit}>{tr('scams.done.back')}</button>}
        </section>
      )}
    </>
  );

  if (embedded) return <div className="sc-embedded" lang={lang}>{body}</div>;
  return (
    <div className="sc-screen" lang={lang}>
      <div className="sc-card k-panel">
        <div className="sc-head">
          {onExit && (
            <button className="k-round" onClick={onExit} aria-label={tr('scams.back')}>
              <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
                <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
              </svg>
            </button>
          )}
          <h1 className="k-banner sc-title">{tr('scams.title')}</h1>
        </div>
        {body}
      </div>
    </div>
  );
}
