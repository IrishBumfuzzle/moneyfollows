import { useEffect, useRef, useState } from 'react';
import { assessmentKind, nextAssessment, resultNote, useAssessments, useAssessmentsHydrated } from './assessments';
import type { AssessmentKind } from './assessments';
import { ASSESSMENT_BANK, CLASSROOM_BANK, t } from './content';
import { answer, currentQuestion, isFinished, next, result, startQuiz } from './quiz';
import type { AnswerFeedback, QuizResult, QuizSession } from './quiz';
import { PILLARS } from './types';
import type { Lang } from './types';
import '../../design/kenney.css';
import './classroom.css';

// Backdrop: public/assets/classroom.png, 360x640, built by tools/build-classroom.py. The room
// sits in the middle with black bars at the sides; everything below is laid out in those
// stage pixels and scaled as one. Whole-number zoom when the screen is big enough (crisp
// pixels); a short phone gets a fractional fit so nothing is cut off.
const STAGE = { w: 360, h: 640 };
const MAX_ZOOM = 3;
const QUESTIONS = 5;

function useStageScale() {
  const read = () => {
    const s = Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h);
    return s >= 1 ? Math.min(MAX_ZOOM, Math.floor(s)) : s;
  };
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const on = () => setScale(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

type Note = { key: string; vars: Record<string, number> };
type Phase =
  | { name: 'intro' }
  | { name: 'quiz'; feedback: AnswerFeedback | null; chosen: number | null }
  | { name: 'result'; result: QuizResult; note: Note | null };

const practice = (seed: number) => startQuiz(CLASSROOM_BANK, { kind: 'classroom', seed, count: QUESTIONS });

export function ClassroomScreen({ lang, seed, endlineOpen = false, onExit, onFinish }: {
  lang: Lang;
  seed: number;
  /** The teacher has opened the end-of-term check (class_status.endline_open). */
  endlineOpen?: boolean;
  onExit: () => void;
  /** Called once per finished quiz, practice or check; turn it into a quiz_submitted event with toSubmittedEvent. */
  onFinish?: (r: QuizResult) => void;
}) {
  const scale = useStageScale();
  const [round, setRound] = useState(0);
  const [session, setSession] = useState<QuizSession>(() => practice(seed));
  const [phase, setPhase] = useState<Phase>({ name: 'intro' });
  const boardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  // A check hides right and wrong until the result, so no green or red and no explanation.
  const hidden = session.feedback === 'end';
  // Until the saved record is read, offer no check (it may already be done).
  const hydrated = useAssessmentsHydrated();
  const done = useAssessments((s) => s.done);
  const offered = hydrated ? nextAssessment(done, endlineOpen) : null;

  // Move focus to the board when the question changes, so screen readers read it next.
  useEffect(() => boardRef.current?.focus(), [phase.name, session.index]);
  // Answering locks the option buttons, which drops keyboard focus; put it on Next.
  const answeredHidden = hidden && phase.name === 'quiz' && !!phase.feedback;
  useEffect(() => {
    if (answeredHidden) nextRef.current?.focus();
  }, [answeredHidden]);

  const q = currentQuestion(session);

  function begin(s: QuizSession) {
    setSession(s);
    setPhase({ name: 'quiz', feedback: null, chosen: null });
  }

  function startCheck(kind: AssessmentKind) {
    begin(startQuiz(ASSESSMENT_BANK, { kind, seed, quizId: kind, feedback: 'end' }));
  }

  function choose(i: number) {
    if (phase.name !== 'quiz' || phase.feedback) return;
    const r = answer(session, i);
    setSession(r.session);
    setPhase({ name: 'quiz', feedback: r.feedback, chosen: i });
  }

  function advance() {
    const s = next(session);
    setSession(s);
    if (isFinished(s)) {
      const r = result(s);
      const kind = assessmentKind(r.kind);
      let note: Note | null = null;
      if (kind) {
        const store = useAssessments.getState();
        note = resultNote(kind, r.score, store.done.baseline?.score);
        store.record(kind, r.score);
      }
      onFinish?.(r);
      setPhase({ name: 'result', result: r, note });
    } else setPhase({ name: 'quiz', feedback: null, chosen: null });
  }

  // Practice again. After a check this is the way on, because a check is never repeated.
  function replay() {
    const n = round + 1;
    setRound(n);
    begin(practice(seed + n));
  }

  const optionClass = (i: number) => {
    if (phase.name !== 'quiz' || !phase.feedback) return '';
    if (hidden) return i === phase.chosen ? 'is-picked' : 'is-dim';
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
              const state = a ? (hidden ? 'is-done' : a.correct ? 'is-right' : 'is-wrong') : i === session.index ? 'is-now' : '';
              return <li key={x.id} className={`k-pip ${state}`} />;
            })}
          </ol>
        )}

        <div className="cr-board" ref={boardRef} tabIndex={-1} aria-live="polite">
          {phase.name === 'intro' && <p>{tr(offered ? `classroom.assess.${offered}.intro` : 'classroom.intro')}</p>}
          {phase.name === 'quiz' && q && (
            <>
              <p className="cr-board-label">{tr('classroom.progress', { n: session.index + 1, total: session.questions.length })}</p>
              <p>{tr(q.text)}</p>
            </>
          )}
          {phase.name === 'result' && (
            <>
              <p className="cr-board-label">{tr(assessmentKind(phase.result.kind) ? `classroom.assess.${phase.result.kind}.title` : 'classroom.result.title')}</p>
              <p className="cr-score">{phase.result.score}%</p>
              <p>{tr('classroom.result.score', { correct: phase.result.correct, total: phase.result.total })}</p>
            </>
          )}
        </div>

        {phase.name !== 'quiz' && <div className="k-banner cr-banner">{tr('classroom.title')}</div>}

        {phase.name === 'intro' && (
          <div className="cr-floor cr-floor-end">
            {offered ? (
              <>
                <button className="k-btn is-primary cr-wide" onClick={() => startCheck(offered)}>
                  {tr(`classroom.assess.${offered}.start`)}
                </button>
                <button className="k-btn cr-wide cr-center" onClick={() => setPhase({ name: 'quiz', feedback: null, chosen: null })}>
                  {tr('classroom.assess.practice')}
                </button>
              </>
            ) : (
              <button className="k-btn is-primary cr-wide" onClick={() => setPhase({ name: 'quiz', feedback: null, chosen: null })}>
                {tr('classroom.start')}
              </button>
            )}
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
            {phase.feedback && hidden && (
              <button ref={nextRef} className="k-btn is-primary cr-wide cr-next" onClick={advance}>
                {tr(session.index + 1 >= session.questions.length ? 'classroom.finish' : 'classroom.next')}
              </button>
            )}
            {phase.feedback && !hidden && (
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
            {phase.note && <p className="k-panel cr-note">{tr(phase.note.key, phase.note.vars)}</p>}
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
            <button className="k-btn is-primary cr-wide" onClick={replay}>
              {tr(assessmentKind(phase.result.kind) ? 'classroom.assess.practice_next' : 'classroom.retry')}
            </button>
            <button className="k-btn cr-wide cr-center" onClick={onExit}>{tr('classroom.back')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
