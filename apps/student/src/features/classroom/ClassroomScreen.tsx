import { useEffect, useRef, useState } from 'react';
import { answerQuestion, currentQuestion, isQuizFinished, nextQuestion, quizResult, startQuiz } from '@paisa/engine';
import type { AnswerFeedback, QuizResult, QuizSession } from '@paisa/engine';
import { PILLARS } from '@paisa/shared';
import type { Lang } from '@paisa/shared';
import type { ClassroomConfig } from './config';
import { CLASSROOM_BANK, t } from './content';
import '../../design/kenney.css';
import './classroom.css';

// Backdrop: public/assets/classroom.png, 360x640, built by tools/build-classroom.py. The room
// sits in the middle with black bars at the sides; everything below is laid out in those
// stage pixels and scaled as one. Whole-number zoom when the screen is big enough (crisp
// pixels at 2x and up); otherwise it fills the screen with a fractional zoom.
const STAGE = { w: 360, h: 640 };
const MAX_ZOOM = 3;
// The room is x 28–332 of the 360 px backdrop; the black side bars may be cropped off a narrow
// phone, so the room itself (not the whole backdrop) sets the width that must fit.
const ROOM_W = 304;

function useStageScale() {
  const read = () => {
    const fit = Math.min(window.innerWidth / ROOM_W, window.innerHeight / STAGE.h);
    // Fill the screen. On big screens (2x and up) snap to whole-number zoom for crisp pixels
    // when that loses under a tenth of the size.
    const whole = Math.min(MAX_ZOOM, Math.floor(fit));
    return whole >= 2 && whole / fit > 0.9 ? whole : Math.min(fit, MAX_ZOOM);
  };
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const on = () => setScale(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

type Phase = { name: 'intro' } | { name: 'quiz'; feedback: AnswerFeedback | null; chosen: number | null } | { name: 'result'; result: QuizResult };

export function ClassroomScreen({ lang, seed, config, onExit, onFinish }: {
  lang: Lang;
  seed: number;
  /** Questions per round and pillars, from the class (config.ts). */
  config: ClassroomConfig;
  onExit: () => void;
  /** Called once per finished quiz; App sends it as a quiz_submitted event. */
  onFinish?: (r: QuizResult) => void;
}) {
  const scale = useStageScale();
  const [round, setRound] = useState(0);
  const start = (s: number) => startQuiz(CLASSROOM_BANK, { kind: 'classroom', seed: s, count: config.count, pillars: config.pillars });
  const [session, setSession] = useState<QuizSession>(() => start(seed));
  const [phase, setPhase] = useState<Phase>({ name: 'intro' });
  const boardRef = useRef<HTMLDivElement>(null);
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  // Move focus to the board when the question changes, so screen readers read it next.
  useEffect(() => boardRef.current?.focus(), [phase.name, session.index]);

  const q = currentQuestion(session);

  function choose(i: number) {
    if (phase.name !== 'quiz' || phase.feedback) return;
    const r = answerQuestion(session, i);
    setSession(r.session);
    setPhase({ name: 'quiz', feedback: r.feedback, chosen: i });
  }

  function advance() {
    const s = nextQuestion(session);
    setSession(s);
    if (isQuizFinished(s)) {
      const r = quizResult(s);
      onFinish?.(r);
      setPhase({ name: 'result', result: r });
    } else setPhase({ name: 'quiz', feedback: null, chosen: null });
  }

  function replay() {
    const n = round + 1;
    setRound(n);
    setSession(start(seed + n));
    setPhase({ name: 'quiz', feedback: null, chosen: null });
  }

  const optionClass = (i: number) => {
    if (phase.name !== 'quiz' || !phase.feedback) return '';
    if (i === phase.feedback.correctChoice) return 'is-correct';
    if (i === phase.chosen) return 'is-wrong';
    return 'is-dim';
  };

  return (
    <div className="cr-screen" lang={lang}>
      <div className="cr-stage" style={{ width: STAGE.w, height: STAGE.h, transform: `scale(${scale})` }}>
        <button className="k-round cr-back" onClick={onExit} aria-label={tr('classroom.back')}>
          <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
          </svg>
        </button>

        {phase.name === 'quiz' && (
          <ol className="cr-pips" aria-label={tr('classroom.progress', { n: session.index + 1, total: session.questions.length })}>
            {session.questions.map((x, i) => {
              const a = session.answers[i];
              return <li key={x.id} className={`k-pip ${a ? (a.correct ? 'is-right' : 'is-wrong') : i === session.index ? 'is-now' : ''}`} />;
            })}
          </ol>
        )}

        <div className="cr-board" ref={boardRef} tabIndex={-1} aria-live="polite">
          {phase.name === 'intro' && <p>{tr('classroom.intro', { count: session.questions.length })}</p>}
          {phase.name === 'quiz' && q && (
            <>
              <p className="cr-board-label">{tr('classroom.progress', { n: session.index + 1, total: session.questions.length })}</p>
              <p>{tr(q.text)}</p>
            </>
          )}
          {phase.name === 'result' && (
            <>
              <p className="cr-board-label">{tr('classroom.result.title')}</p>
              <p className="cr-score">{phase.result.score}%</p>
              <p>{tr('classroom.result.score', { correct: phase.result.correct, total: phase.result.total })}</p>
            </>
          )}
        </div>

        {phase.name !== 'quiz' && <div className="k-banner cr-banner">{tr('classroom.title')}</div>}

        {phase.name === 'intro' && (
          <div className="cr-floor cr-floor-end">
            <button className="k-btn is-primary cr-wide" onClick={() => setPhase({ name: 'quiz', feedback: null, chosen: null })}>
              {tr('classroom.start')}
            </button>
          </div>
        )}

        {phase.name === 'quiz' && q && (
          <div className="cr-floor">
            <div className="cr-options" role="group" aria-label={tr(q.text)}>
              {q.options.map((o, i) => (
                <button key={o} className={`k-btn ${optionClass(i)}`} disabled={!!phase.feedback} onClick={() => choose(i)}>
                  <span className="cr-letter" aria-hidden="true">{'ABCD'[i]}</span>
                  <span>{tr(o)}</span>
                </button>
              ))}
            </div>
            {phase.feedback && (
              <div className="k-panel cr-feedback" role="status">
                <p className={`cr-verdict ${phase.feedback.correct ? 'is-right' : 'is-wrong'}`}>
                  {tr(phase.feedback.correct ? 'classroom.correct' : 'classroom.wrong')}
                </p>
                {phase.feedback.explanation && <p>{tr(phase.feedback.explanation)}</p>}
                <button className="k-btn is-primary" onClick={advance}>
                  {tr(session.index + 1 >= session.questions.length ? 'classroom.finish' : 'classroom.next')}
                </button>
              </div>
            )}
          </div>
        )}

        {phase.name === 'result' && (
          <div className="cr-floor cr-floor-end">
            <ul className="k-panel cr-pillars">
              {PILLARS.filter((p) => phase.result.byPillar[p]).map((p) => {
                const b = phase.result.byPillar[p]!;
                return (
                  <li key={p}>
                    <span>{tr(`classroom.pillar.${p}`)}</span>
                    <span className="cr-pillar-score">{b.correct}/{b.total}</span>
                  </li>
                );
              })}
            </ul>
            <button className="k-btn is-primary cr-wide" onClick={replay}>{tr('classroom.retry')}</button>
            <button className="k-btn cr-wide cr-center" onClick={onExit}>{tr('classroom.back')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
