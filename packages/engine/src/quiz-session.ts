// Quiz sessions: the classroom quiz at School, and the baseline and end-line tests, played one
// question at a time. Moved from apps/student/src/features/classroom/quiz.ts (API.md "Quiz API")
// with the same behaviour, using the engine's hash instead of a second RNG. Pure like the rest
// of the engine: state in, state out, inputs never mutated, sessions round-trip through JSON.
import { PILLARS } from '@paisa/shared';
import type { Pillar, QuizAnswer, QuizQuestion, QuizType, SyncEvent, TKey } from '@paisa/shared';
import { EngineError } from './errors';
import { unit } from './hash';

export interface QuizOptions {
  kind: QuizType;
  seed: number;
  /** Stable id for this quiz, sent with the result. Defaults to the kind. */
  quizId?: string;
  /** How many questions. Defaults to all that match. Classroom uses 5. */
  count?: number;
  /** Only these pillars. Defaults to all four. */
  pillars?: Pillar[];
  /**
   * 'instant' shows right/wrong and the explanation after each answer (classroom).
   * 'end' hides them until the result (baseline and end-line tests). Default by kind.
   */
  feedback?: 'instant' | 'end';
}

export interface QuizSession {
  version: 1;
  quizId: string;
  kind: QuizType;
  seed: number;
  feedback: 'instant' | 'end';
  /** Questions in play order, options in display order, `answer` re-pointed. */
  questions: QuizQuestion[];
  /** order[q][displayIndex] = index in the content's options. */
  order: number[][];
  /** Index of the current question; equals questions.length when finished. */
  index: number;
  /** One per answered question, in play order. */
  answers: QuizAnswer[];
}

export interface AnswerFeedback {
  questionId: string;
  correct: boolean;
  /** Display index of the right option; null in 'end' mode. */
  correctChoice: number | null;
  /** Null in 'end' mode. */
  explanation: TKey | null;
}

export interface QuizResult {
  quizId: string;
  kind: QuizType;
  /** 0–100, rounded. */
  score: number;
  correct: number;
  total: number;
  answers: QuizAnswer[];
  byPillar: Partial<Record<Pillar, { correct: number; total: number }>>;
}

/** Fisher–Yates over the engine hash: the same seed and key always give the same order. */
function shuffled<T>(items: readonly T[], seed: number, ...key: (string | number)[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(unit(seed, 'quizsession', ...key, i) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const byId = (a: QuizQuestion, b: QuizQuestion): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Picks the questions and fixes their order. Questions are drawn round-robin across pillars
 * (so 5 classroom questions touch every pillar), each pillar's pool shuffled by seed; options
 * are shuffled per question and `answer` follows its option. Errors: quiz_empty, quiz_bad_count.
 */
export function startQuiz(bank: readonly QuizQuestion[], opts: QuizOptions): QuizSession {
  const pillars = opts.pillars ?? PILLARS;
  const pools = PILLARS.filter((p) => pillars.includes(p)).map((p) =>
    shuffled(bank.filter((q) => q.quiz === opts.kind && q.pillar === p).sort(byId), opts.seed, 'pool', p),
  );
  const available = pools.reduce((n, p) => n + p.length, 0);
  if (available === 0) throw new EngineError('quiz_empty', `no ${opts.kind} questions for these pillars`);
  const count = opts.count ?? available;
  if (!Number.isInteger(count) || count < 1 || count > available) {
    throw new EngineError('quiz_bad_count', `count must be 1..${available}: ${count}`);
  }

  const picked: QuizQuestion[] = [];
  const start = Math.floor(unit(opts.seed, 'quizsession', 'start') * pools.length);
  for (let round = 0; picked.length < count; round++) {
    for (let k = 0; k < pools.length && picked.length < count; k++) {
      const q = pools[(start + k) % pools.length]![round];
      if (q) picked.push(q);
    }
  }

  const order = picked.map((q) =>
    shuffled(
      q.options.map((_, i) => i),
      opts.seed,
      'opt',
      q.id,
    ),
  );
  const questions = picked.map((q, n) => ({
    ...q,
    options: order[n]!.map((i) => q.options[i]!),
    answer: order[n]!.indexOf(q.answer),
    meta: { ...q.meta },
  }));

  return {
    version: 1,
    quizId: opts.quizId ?? opts.kind,
    kind: opts.kind,
    seed: opts.seed,
    feedback: opts.feedback ?? (opts.kind === 'classroom' ? 'instant' : 'end'),
    questions,
    order,
    index: 0,
    answers: [],
  };
}

export function isQuizFinished(s: QuizSession): boolean {
  return s.index >= s.questions.length;
}

export function currentQuestion(s: QuizSession): QuizQuestion | null {
  return s.questions[s.index] ?? null;
}

/** True once the current question has an answer (and nextQuestion is allowed). */
export function isQuestionAnswered(s: QuizSession): boolean {
  return s.answers.length > s.index;
}

/**
 * Answers the current question with a display index. The first answer counts; no retries.
 * Errors: quiz_finished, quiz_already_answered, quiz_bad_choice.
 */
export function answerQuestion(s: QuizSession, choice: number): { session: QuizSession; feedback: AnswerFeedback } {
  const q = currentQuestion(s);
  if (!q) throw new EngineError('quiz_finished', 'the quiz is finished');
  if (isQuestionAnswered(s)) throw new EngineError('quiz_already_answered', `already answered: ${q.id}`);
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) {
    throw new EngineError('quiz_bad_choice', `choice must be 0..${q.options.length - 1}: ${choice}`);
  }

  const correct = choice === q.answer;
  const stored: QuizAnswer = { questionId: q.id, pillar: q.pillar, choice: s.order[s.index]![choice]!, correct };
  const instant = s.feedback === 'instant';
  return {
    session: { ...s, answers: [...s.answers, stored] },
    feedback: {
      questionId: q.id,
      correct,
      correctChoice: instant ? q.answer : null,
      explanation: instant ? q.explanation : null,
    },
  };
}

/** Moves on after the current question is answered. Errors: quiz_finished, quiz_not_answered. */
export function nextQuestion(s: QuizSession): QuizSession {
  if (isQuizFinished(s)) throw new EngineError('quiz_finished', 'the quiz is finished');
  if (!isQuestionAnswered(s)) throw new EngineError('quiz_not_answered', 'answer the current question first');
  return { ...s, index: s.index + 1 };
}

/** The finished quiz's score, with a per-pillar split. Error: quiz_not_finished. */
export function quizResult(s: QuizSession): QuizResult {
  if (!isQuizFinished(s)) throw new EngineError('quiz_not_finished', 'the quiz is not finished');
  const byPillar: QuizResult['byPillar'] = {};
  for (const a of s.answers) {
    const p = (byPillar[a.pillar] ??= { correct: 0, total: 0 });
    p.total++;
    if (a.correct) p.correct++;
  }
  const correct = s.answers.filter((a) => a.correct).length;
  const total = s.questions.length;
  return {
    quizId: s.quizId,
    kind: s.kind,
    score: Math.round((100 * correct) / total),
    correct,
    total,
    answers: s.answers.map((a) => ({ ...a })),
    byPillar,
  };
}

/**
 * The `quiz_submitted` SyncEvent for a finished quiz (5.5), to queue and send with push_events.
 * Its payload passes the backend's quiz_payload_ok: quiz_type, quiz_id, score and answers.
 * Ids and time come from the caller, so this stays pure.
 */
export function quizSubmittedEvent(
  r: QuizResult,
  ctx: { event_id: string; anon_id: string; class_id: string; client_ts: string; content_version: string },
): SyncEvent {
  return {
    ...ctx,
    type: 'quiz_submitted',
    payload: { quiz_type: r.kind, quiz_id: r.quizId, score: r.score, answers: r.answers },
  };
}
