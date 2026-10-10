import { describe, expect, it } from 'vitest';
import { CLASSROOM_BANK, STRINGS } from './content';
import { answer, currentQuestion, isAnswered, isFinished, next, QuizError, result, startQuiz, toSubmittedEvent } from './quiz';
import type { QuizSession } from './quiz';
import { PILLARS } from './types';
import type { QuizQuestion } from './types';

const opts = { kind: 'classroom' as const, seed: 42, count: 5 };

/** Plays a whole quiz, picking `pick(session)` each time. */
function play(s: QuizSession, pick: (s: QuizSession) => number) {
  while (!isFinished(s)) s = next(answer(s, pick(s)).session);
  return s;
}
const right = (s: QuizSession) => currentQuestion(s)!.answer;
const wrong = (s: QuizSession) => (currentQuestion(s)!.answer + 1) % currentQuestion(s)!.options.length;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

describe('startQuiz', () => {
  it('is deterministic: same bank + seed gives the same questions and option order', () => {
    expect(startQuiz(CLASSROOM_BANK, opts)).toEqual(startQuiz(CLASSROOM_BANK, opts));
  });

  it('different seeds give different sessions', () => {
    const seen = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(startQuiz(CLASSROOM_BANK, { ...opts, seed }).questions)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('draws across pillars, so 5 questions cover all four', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const s = startQuiz(CLASSROOM_BANK, { ...opts, seed });
      expect(new Set(s.questions.map((q) => q.pillar)).size).toBe(4);
      expect(new Set(s.questions.map((q) => q.id)).size).toBe(5);
    }
  });

  it('answer follows its option after the shuffle', () => {
    const byId = new Map(CLASSROOM_BANK.map((q) => [q.id, q]));
    const s = startQuiz(CLASSROOM_BANK, { ...opts, count: 8 });
    s.questions.forEach((q, n) => {
      const orig = byId.get(q.id)!;
      expect(q.options[q.answer]).toBe(orig.options[orig.answer]);
      expect([...q.options].sort()).toEqual([...orig.options].sort());
      expect(s.order[n]!.map((i) => orig.options[i])).toEqual(q.options);
    });
  });

  it('filters by kind and pillar', () => {
    const s = startQuiz(CLASSROOM_BANK, { kind: 'classroom', seed: 3, pillars: ['stay_safe'] });
    expect(s.questions.map((q) => q.pillar)).toEqual(['stay_safe', 'stay_safe']);
    expect(() => startQuiz(CLASSROOM_BANK, { kind: 'baseline', seed: 1 })).toThrow(QuizError);
  });

  it('rejects a bad count', () => {
    expect(() => startQuiz(CLASSROOM_BANK, { ...opts, count: 0 })).toThrow('bad_count');
    expect(() => startQuiz(CLASSROOM_BANK, { ...opts, count: 99 })).toThrow('bad_count');
  });

  it('feedback defaults: instant for classroom, end for baseline/endline', () => {
    const bank: QuizQuestion[] = CLASSROOM_BANK.map((q) => ({ ...q, quiz: 'baseline' }));
    expect(startQuiz(CLASSROOM_BANK, opts).feedback).toBe('instant');
    expect(startQuiz(bank, { kind: 'baseline', seed: 1 }).feedback).toBe('end');
  });
});

describe('answer / next', () => {
  it('scores right and wrong answers and stores the un-shuffled choice', () => {
    const s0 = startQuiz(CLASSROOM_BANK, opts);
    const q = currentQuestion(s0)!;
    const ok = answer(s0, q.answer);
    expect(ok.feedback).toEqual({ questionId: q.id, correct: true, correctChoice: q.answer, explanation: q.explanation });
    const orig = CLASSROOM_BANK.find((x) => x.id === q.id)!;
    expect(ok.session.answers[0]).toEqual({ questionId: q.id, pillar: q.pillar, choice: orig.answer, correct: true });

    const bad = answer(s0, wrong(s0));
    expect(bad.feedback.correct).toBe(false);
    expect(bad.feedback.correctChoice).toBe(q.answer);
  });

  it('stored choice points at the same option in the content file, for every question and choice', () => {
    const byId = new Map(CLASSROOM_BANK.map((q) => [q.id, q]));
    let s = startQuiz(CLASSROOM_BANK, { ...opts, count: 8 });
    let moved = 0;
    while (!isFinished(s)) {
      const q = currentQuestion(s)!;
      const orig = byId.get(q.id)!;
      q.options.forEach((label, display) => {
        const stored = answer(s, display).session.answers.at(-1)!;
        expect(orig.options[stored.choice]).toBe(label);
        if (stored.choice !== display) moved++;
      });
      s = next(answer(s, 0).session);
    }
    expect(moved).toBeGreaterThan(0); // the shuffle actually moved something, so this test can fail
  });

  it('hides the right answer and explanation in end mode', () => {
    const s = startQuiz(CLASSROOM_BANK, { ...opts, feedback: 'end' });
    const { feedback } = answer(s, 0);
    expect(feedback.correctChoice).toBeNull();
    expect(feedback.explanation).toBeNull();
  });

  it('first answer counts: no second answer, no skipping', () => {
    const s0 = startQuiz(CLASSROOM_BANK, opts);
    expect(() => next(s0)).toThrow('not_answered');
    const s1 = answer(s0, 0).session;
    expect(isAnswered(s1)).toBe(true);
    expect(() => answer(s1, 1)).toThrow('already_answered');
    expect(() => answer(s0, 7)).toThrow('bad_choice');
    expect(() => answer(s0, -1)).toThrow('bad_choice');
    expect(() => answer(s0, 0.5)).toThrow('bad_choice');
  });

  it('never mutates its input', () => {
    const s0 = deepFreeze(startQuiz(CLASSROOM_BANK, opts));
    const snapshot = JSON.stringify(s0);
    const s1 = deepFreeze(answer(s0, 0).session);
    next(s1);
    expect(JSON.stringify(s0)).toBe(snapshot);
    const bank = deepFreeze(structuredClone(CLASSROOM_BANK));
    expect(() => startQuiz(bank, opts)).not.toThrow();
  });

  it('round-trips through JSON mid-quiz', () => {
    const s = next(answer(startQuiz(CLASSROOM_BANK, opts), 1).session);
    const back = JSON.parse(JSON.stringify(s)) as QuizSession;
    expect(back).toEqual(s);
    expect(result(play(back, right))).toEqual(result(play(s, right)));
  });

  it('blocks play after the last question', () => {
    const done = play(startQuiz(CLASSROOM_BANK, opts), right);
    expect(isFinished(done)).toBe(true);
    expect(currentQuestion(done)).toBeNull();
    expect(() => answer(done, 0)).toThrow('finished');
    expect(() => next(done)).toThrow('finished');
  });
});

describe('result', () => {
  it('all right = 100, all wrong = 0, with a per-pillar split', () => {
    const s = startQuiz(CLASSROOM_BANK, opts);
    const best = result(play(s, right));
    expect(best).toMatchObject({ score: 100, correct: 5, total: 5, kind: 'classroom', quizId: 'classroom' });
    expect(Object.values(best.byPillar).reduce((n, p) => n + p!.total, 0)).toBe(5);
    expect(result(play(s, wrong)).score).toBe(0);
  });

  it('rounds the score (2 of 3 = 67)', () => {
    let s = startQuiz(CLASSROOM_BANK, { ...opts, count: 3 });
    s = next(answer(s, right(s)).session);
    s = next(answer(s, right(s)).session);
    s = next(answer(s, wrong(s)).session);
    expect(result(s).score).toBe(67);
  });

  it('is only available when finished', () => {
    expect(() => result(startQuiz(CLASSROOM_BANK, opts))).toThrow('not_finished');
  });

  it('builds a quiz_submitted event the backend payload check accepts', () => {
    const r = result(play(startQuiz(CLASSROOM_BANK, opts), right));
    const ctx = { event_id: 'e1', anon_id: 'a1', class_id: 'c1', client_ts: '2026-10-10T10:00:00.000Z', content_version: 'v' };
    const ev = toSubmittedEvent(r, ctx);
    expect(ev).toMatchObject({ ...ctx, type: 'quiz_submitted' });
    const p = ev.payload as { quiz_type: string; quiz_id: string; score: number; answers: unknown[] };
    expect(p).toEqual({ quiz_type: 'classroom', quiz_id: 'classroom', score: 100, answers: r.answers });
    // Mirrors public.quiz_payload_ok (supabase migration on origin/Backend), minus quiz_type.
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

describe('classroom content (guardrails, CLAUDE.md 7.2)', () => {
  const keys = (q: QuizQuestion) => [q.text, ...q.options, q.explanation];
  const FORBIDDEN = /guarantee|sure return|risk-free|you should (invest|buy)/i;

  it('ids are unique and every question has 2–4 options and a valid answer', () => {
    expect(new Set(CLASSROOM_BANK.map((q) => q.id)).size).toBe(CLASSROOM_BANK.length);
    for (const q of CLASSROOM_BANK) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(PILLARS).toContain(q.pillar);
    }
  });

  it('has at least 2 questions per pillar, so a 5-question quiz always covers all four', () => {
    for (const p of PILLARS) expect(CLASSROOM_BANK.filter((q) => q.pillar === p).length).toBeGreaterThanOrEqual(2);
  });

  it('every key exists in en and hi', () => {
    const uiKeys = Object.keys(STRINGS.en!).filter((k) => k.startsWith('classroom.'));
    for (const k of [...CLASSROOM_BANK.flatMap(keys).map((k) => k.slice(2)), ...uiKeys]) {
      expect(STRINGS.en![k], `en ${k}`).toBeTruthy();
      expect(STRINGS.hi![k], `hi ${k}`).toBeTruthy();
    }
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
  });

  it('keeps to length caps and the forbidden-word list', () => {
    for (const lang of ['en', 'hi'] as const) {
      for (const q of CLASSROOM_BANK) {
        const s = (k: string) => STRINGS[lang]![k.slice(2)]!;
        expect(s(q.text).length, q.text).toBeLessThanOrEqual(220);
        for (const o of q.options) expect(s(o).length, `${lang} ${o}`).toBeLessThanOrEqual(40);
        expect(s(q.explanation).length, q.explanation).toBeLessThanOrEqual(140);
        for (const k of keys(q)) expect(s(k)).not.toMatch(FORBIDDEN);
      }
    }
  });
});
