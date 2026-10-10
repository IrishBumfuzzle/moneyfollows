// Ported from apps/student/src/features/classroom/quiz.test.ts: same behaviour, engine errors.
import { describe, expect, it } from 'vitest';
import { PILLARS, QuizQuestionSchema, SyncEventSchema } from '@paisa/shared';
import type { Pillar, QuizQuestion } from '@paisa/shared';
import {
  EngineError,
  answerQuestion,
  currentQuestion,
  isQuestionAnswered,
  isQuizFinished,
  nextQuestion,
  quizResult,
  quizSubmittedEvent,
  startQuiz,
  type QuizSession,
} from '../src';
import { deepFreeze } from './fixtures';

const pillarKey: Record<Pillar, string> = {
  plan_budget: 'budget',
  save_manage: 'save',
  understand_investing: 'invest',
  stay_safe: 'safe',
};
/** 2 classroom questions per pillar with 3 options each: the shape of the real classroom pack. */
const BANK: QuizQuestion[] = PILLARS.flatMap((pillar) =>
  [0, 1].map((n) => {
    const id = `quiz.classroom.${pillarKey[pillar]}.q${n}`;
    return QuizQuestionSchema.parse({
      id,
      quiz: 'classroom',
      pillar,
      concept: `c${n}`,
      text: `t:${id}.q`,
      options: [`t:${id}.o1`, `t:${id}.o2`, `t:${id}.o3`],
      answer: n % 3,
      explanation: `t:${id}.why`,
      meta: { status: 'draft', author: 'test' },
    });
  }),
);
const opts = { kind: 'classroom' as const, seed: 42, count: 5 };

const play = (s: QuizSession, pick: (s: QuizSession) => number) => {
  while (!isQuizFinished(s)) s = nextQuestion(answerQuestion(s, pick(s)).session);
  return s;
};
const right = (s: QuizSession) => currentQuestion(s)!.answer;
const wrong = (s: QuizSession) => (currentQuestion(s)!.answer + 1) % currentQuestion(s)!.options.length;
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : 'not an EngineError';
  }
  return undefined;
};

describe('startQuiz', () => {
  it('is deterministic: same bank + seed gives the same questions and option order', () => {
    expect(startQuiz(BANK, opts)).toEqual(startQuiz(BANK, opts));
  });

  it('different seeds give different sessions', () => {
    const seen = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(startQuiz(BANK, { ...opts, seed }).questions)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('draws across pillars, so 5 questions cover all four', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const s = startQuiz(BANK, { ...opts, seed });
      expect(new Set(s.questions.map((q) => q.pillar)).size).toBe(4);
      expect(new Set(s.questions.map((q) => q.id)).size).toBe(5);
    }
  });

  it('answer follows its option after the shuffle', () => {
    const byId = new Map(BANK.map((q) => [q.id, q]));
    const s = startQuiz(BANK, { ...opts, count: 8 });
    s.questions.forEach((q, n) => {
      const orig = byId.get(q.id)!;
      expect(q.options[q.answer]).toBe(orig.options[orig.answer]);
      expect([...q.options].sort()).toEqual([...orig.options].sort());
      expect(s.order[n]!.map((i) => orig.options[i])).toEqual(q.options);
    });
  });

  it('filters by kind and pillar', () => {
    const s = startQuiz(BANK, { kind: 'classroom', seed: 3, pillars: ['stay_safe'] });
    expect(s.questions.map((q) => q.pillar)).toEqual(['stay_safe', 'stay_safe']);
    expect(code(() => startQuiz(BANK, { kind: 'baseline', seed: 1 }))).toBe('quiz_empty');
  });

  it('rejects a bad count', () => {
    expect(code(() => startQuiz(BANK, { ...opts, count: 0 }))).toBe('quiz_bad_count');
    expect(code(() => startQuiz(BANK, { ...opts, count: 99 }))).toBe('quiz_bad_count');
    expect(code(() => startQuiz(BANK, { ...opts, count: 2.5 }))).toBe('quiz_bad_count');
  });

  it('feedback defaults: instant for classroom, end for baseline/endline', () => {
    const baseline: QuizQuestion[] = BANK.map((q) => ({ ...q, quiz: 'baseline' }));
    expect(startQuiz(BANK, opts).feedback).toBe('instant');
    expect(startQuiz(baseline, { kind: 'baseline', seed: 1 }).feedback).toBe('end');
  });
});

describe('answerQuestion / nextQuestion', () => {
  it('scores right and wrong answers and stores the un-shuffled choice', () => {
    const s0 = startQuiz(BANK, opts);
    const q = currentQuestion(s0)!;
    const ok = answerQuestion(s0, q.answer);
    expect(ok.feedback).toEqual({
      questionId: q.id,
      correct: true,
      correctChoice: q.answer,
      explanation: q.explanation,
    });
    const orig = BANK.find((x) => x.id === q.id)!;
    expect(ok.session.answers[0]).toEqual({ questionId: q.id, pillar: q.pillar, choice: orig.answer, correct: true });
    const bad = answerQuestion(s0, wrong(s0));
    expect(bad.feedback.correct).toBe(false);
    expect(bad.feedback.correctChoice).toBe(q.answer);
  });

  it('stored choice points at the same option in the content, for every question and choice', () => {
    const byId = new Map(BANK.map((q) => [q.id, q]));
    let moved = 0;
    for (const seed of [1, 2, 3]) {
      let s = startQuiz(BANK, { ...opts, seed, count: 8 });
      while (!isQuizFinished(s)) {
        const q = currentQuestion(s)!;
        const orig = byId.get(q.id)!;
        q.options.forEach((label, display) => {
          const stored = answerQuestion(s, display).session.answers.at(-1)!;
          expect(orig.options[stored.choice]).toBe(label);
          if (stored.choice !== display) moved++;
        });
        s = nextQuestion(answerQuestion(s, 0).session);
      }
    }
    expect(moved).toBeGreaterThan(0); // the shuffle really moved options, so this test can fail
  });

  it('hides the right answer and explanation in end mode', () => {
    const { feedback } = answerQuestion(startQuiz(BANK, { ...opts, feedback: 'end' }), 0);
    expect(feedback.correctChoice).toBeNull();
    expect(feedback.explanation).toBeNull();
  });

  it('first answer counts: no second answer, no skipping', () => {
    const s0 = startQuiz(BANK, opts);
    expect(code(() => nextQuestion(s0))).toBe('quiz_not_answered');
    const s1 = answerQuestion(s0, 0).session;
    expect(isQuestionAnswered(s1)).toBe(true);
    expect(code(() => answerQuestion(s1, 1))).toBe('quiz_already_answered');
    for (const bad of [7, -1, 0.5]) expect(code(() => answerQuestion(s0, bad))).toBe('quiz_bad_choice');
  });

  it('never mutates its input', () => {
    const s0 = deepFreeze(startQuiz(BANK, opts));
    const snapshot = JSON.stringify(s0);
    nextQuestion(deepFreeze(answerQuestion(s0, 0).session));
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(() => startQuiz(deepFreeze(structuredClone(BANK)), opts)).not.toThrow();
  });

  it('round-trips through JSON mid-quiz', () => {
    const s = nextQuestion(answerQuestion(startQuiz(BANK, opts), 1).session);
    const back = JSON.parse(JSON.stringify(s)) as QuizSession;
    expect(back).toEqual(s);
    expect(quizResult(play(back, right))).toEqual(quizResult(play(s, right)));
  });

  it('blocks play after the last question', () => {
    const done = play(startQuiz(BANK, opts), right);
    expect(isQuizFinished(done)).toBe(true);
    expect(currentQuestion(done)).toBeNull();
    expect(code(() => answerQuestion(done, 0))).toBe('quiz_finished');
    expect(code(() => nextQuestion(done))).toBe('quiz_finished');
  });
});

describe('quizResult and quizSubmittedEvent', () => {
  it('all right = 100, all wrong = 0, with a per-pillar split', () => {
    const s = startQuiz(BANK, opts);
    const best = quizResult(play(s, right));
    expect(best).toMatchObject({ score: 100, correct: 5, total: 5, kind: 'classroom', quizId: 'classroom' });
    expect(Object.values(best.byPillar).reduce((n, p) => n + p!.total, 0)).toBe(5);
    expect(quizResult(play(s, wrong)).score).toBe(0);
  });

  it('rounds the score (2 of 3 = 67)', () => {
    let s = startQuiz(BANK, { ...opts, count: 3 });
    s = nextQuestion(answerQuestion(s, right(s)).session);
    s = nextQuestion(answerQuestion(s, right(s)).session);
    s = nextQuestion(answerQuestion(s, wrong(s)).session);
    expect(quizResult(s).score).toBe(67);
  });

  it('is only available when finished', () => {
    expect(code(() => quizResult(startQuiz(BANK, opts)))).toBe('quiz_not_finished');
  });

  it('builds a quiz_submitted SyncEvent the shared schema and the backend payload check accept', () => {
    const r = quizResult(play(startQuiz(BANK, opts), right));
    const ctx = {
      event_id: '11111111-1111-4111-8111-111111111111',
      anon_id: '22222222-2222-4222-8222-222222222222',
      class_id: '33333333-3333-4333-8333-333333333333',
      client_ts: '2026-10-10T10:00:00.000Z',
      content_version: '2026.10.10.5',
    };
    const ev = quizSubmittedEvent(r, ctx);
    expect(SyncEventSchema.safeParse(ev).success).toBe(true);
    expect(ev).toMatchObject({ ...ctx, type: 'quiz_submitted' });
    const p = ev.payload as { quiz_type: string; quiz_id: string; score: number; answers: unknown[] };
    expect(p).toEqual({ quiz_type: 'classroom', quiz_id: 'classroom', score: 100, answers: r.answers });
    // Mirrors public.quiz_payload_ok (migration 20261010230000_classroom_quiz_events.sql).
    expect(['baseline', 'endline', 'classroom']).toContain(p.quiz_type);
    expect(Number.isInteger(p.score) && p.score >= 0 && p.score <= 100).toBe(true);
    expect(p.answers.length).toBeGreaterThanOrEqual(1);
    expect(p.answers.length).toBeLessThanOrEqual(24);
    for (const a of r.answers) {
      expect(typeof a.correct).toBe('boolean');
      expect(typeof a.choice).toBe('number');
      expect(a.questionId.length).toBeLessThanOrEqual(64);
      expect(PILLARS).toContain(a.pillar);
    }
    expect(JSON.stringify(p).length).toBeLessThan(4096);
  });
});

describe('the bundled classroom pack', () => {
  it('plays a 5-question classroom quiz that covers all four pillars, for any seed', async () => {
    const { content } = await import('@paisa/content');
    const bank = content.quizzes.filter((q) => q.quiz === 'classroom');
    for (const seed of [1, 7, 99, 12345]) {
      const s = startQuiz(bank, { ...opts, seed });
      expect(new Set(s.questions.map((q) => q.pillar)).size).toBe(4);
      expect(quizResult(play(s, right)).score).toBe(100);
    }
  });
});
