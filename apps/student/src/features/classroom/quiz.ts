// Quiz API (API.md "Quiz API"). Pure TypeScript with the engine's rules: no DOM, no
// network, no Date.now() or Math.random(); state in, state out, inputs never mutated,
// sessions round-trip through JSON. Meant to move to packages/engine as-is.

import { PILLARS } from './types';
import type { Pillar, QuizAnswer, QuizKind, QuizQuestion, SyncEvent, TKey } from './types';

export type QuizErrorCode = 'empty_bank' | 'bad_count' | 'finished' | 'already_answered' | 'not_answered' | 'bad_choice' | 'not_finished';

export class QuizError extends Error {
  constructor(public code: QuizErrorCode) {
    super(code);
    this.name = 'QuizError';
  }
}

export interface QuizOptions {
  kind: QuizKind;
  seed: number;
  /** Stable id for this quiz, sent with the result. Defaults to the kind. */
  quizId?: string;
  /** How many questions. Defaults to all that match. Classroom uses 5. */
  count?: number;
  /** Only these pillars. Defaults to all four. */
  pillars?: Pillar[];
  /** 'instant' shows right/wrong + explanation after each answer (classroom).
   *  'end' hides them until the result (baseline / end-line tests). Default by kind. */
  feedback?: 'instant' | 'end';
}

export interface QuizSession {
  version: 1;
  quizId: string;
  kind: QuizKind;
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
  kind: QuizKind;
  score: number;               // 0–100, rounded
  correct: number;
  total: number;
  answers: QuizAnswer[];
  byPillar: Partial<Record<Pillar, { correct: number; total: number }>>;
}

// --- seeded randomness (FNV-1a + mulberry32), same idea as the engine's hash ---

function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// --- API ---

/**
 * Picks the questions and fixes their order. Questions are drawn round-robin across
 * pillars (so 5 classroom questions touch every pillar), each pillar's pool shuffled by
 * seed; options are shuffled per question and `answer` follows its option.
 */
export function startQuiz(bank: readonly QuizQuestion[], opts: QuizOptions): QuizSession {
  const pillars = opts.pillars ?? PILLARS;
  const pools = PILLARS.filter((p) => pillars.includes(p)).map((p) =>
    shuffled(
      bank.filter((q) => q.quiz === opts.kind && q.pillar === p).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      hash(opts.seed, 'pool', p),
    ),
  );
  const available = pools.reduce((n, p) => n + p.length, 0);
  if (available === 0) throw new QuizError('empty_bank');
  const count = opts.count ?? available;
  if (!Number.isInteger(count) || count < 1 || count > available) throw new QuizError('bad_count');

  const picked: QuizQuestion[] = [];
  const start = hash(opts.seed, 'start') % pools.length;
  for (let round = 0; picked.length < count; round++) {
    for (let k = 0; k < pools.length && picked.length < count; k++) {
      const q = pools[(start + k) % pools.length]![round];
      if (q) picked.push(q);
    }
  }

  const order = picked.map((q) => shuffled(q.options.map((_, i) => i), hash(opts.seed, 'opt', q.id)));
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

export function isFinished(s: QuizSession): boolean {
  return s.index >= s.questions.length;
}

export function currentQuestion(s: QuizSession): QuizQuestion | null {
  return s.questions[s.index] ?? null;
}

/** True once the current question has an answer (and `next` is allowed). */
export function isAnswered(s: QuizSession): boolean {
  return s.answers.length > s.index;
}

/** Answers the current question with a display index. First answer counts; no retries. */
export function answer(s: QuizSession, choice: number): { session: QuizSession; feedback: AnswerFeedback } {
  const q = currentQuestion(s);
  if (!q) throw new QuizError('finished');
  if (isAnswered(s)) throw new QuizError('already_answered');
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new QuizError('bad_choice');

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

/** Moves on after the current question is answered. */
export function next(s: QuizSession): QuizSession {
  if (isFinished(s)) throw new QuizError('finished');
  if (!isAnswered(s)) throw new QuizError('not_answered');
  return { ...s, index: s.index + 1 };
}

export function result(s: QuizSession): QuizResult {
  if (!isFinished(s)) throw new QuizError('not_finished');
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
 * The `quiz_submitted` SyncEvent for a finished quiz (CLAUDE.md 5.5), to queue and send
 * with push_events. Payload matches the backend's quiz_payload_ok, plus `quiz_id`.
 * Ids and time come from the caller so this stays pure.
 */
export function toSubmittedEvent(
  r: QuizResult,
  ctx: { event_id: string; anon_id: string; class_id: string; client_ts: string; content_version: string },
): SyncEvent {
  return {
    ...ctx,
    type: 'quiz_submitted',
    payload: { quiz_type: r.kind, quiz_id: r.quizId, score: r.score, answers: r.answers },
  };
}
