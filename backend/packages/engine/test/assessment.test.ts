import { describe, expect, it } from 'vitest';
import { PILLARS, QuizResult, type QuizQuestion } from '@paisa/contracts';
import { assembleQuiz, scoreQuiz } from '../src';
import { clone, content, variant } from './fixtures';

const ids = (qs: QuizQuestion[]) => qs.map((q) => q.id);

describe('assembleQuiz', () => {
  it('baseline is form A, ordered by pillar then id', () => {
    const qs = assembleQuiz(content, { kind: 'baseline' });
    expect(qs.length).toBe(5);
    expect(qs.every((q) => q.form === 'A')).toBe(true);
    expect(qs.map((q) => q.pillar)).toEqual(['plan_budget', 'save_manage', 'understand_investing', 'understand_investing', 'stay_safe']);
    expect(ids(qs).slice(2, 4)).toEqual(['quiz.invest.compound.a', 'quiz.invest.risk.a']);
  });

  it('endline is the parallel form B', () => {
    const a = assembleQuiz(content, { kind: 'baseline' });
    const b = assembleQuiz(content, { kind: 'endline' });
    expect(b.every((q) => q.form === 'B')).toBe(true);
    expect(b.map((q) => q.concept)).toEqual(a.map((q) => q.concept));
  });

  it('is deterministic whatever order the pack lists questions in', () => {
    const shuffled = variant((c) => {
      c.quizQuestions.reverse();
    });
    for (const kind of ['baseline', 'endline', 'retention', 'module'] as const) {
      expect(ids(assembleQuiz(shuffled, { kind }))).toEqual(ids(assembleQuiz(content, { kind })));
    }
  });

  it('module quiz uses both forms for one pillar', () => {
    const qs = assembleQuiz(content, { kind: 'module', pillar: 'understand_investing' });
    expect(qs.length).toBe(4);
    expect(new Set(qs.map((q) => q.form))).toEqual(new Set(['A', 'B']));
    expect(qs.every((q) => q.pillar === 'understand_investing')).toBe(true);
  });

  it('retention is five form B questions balanced across pillars', () => {
    const many = variant((c) => {
      const base = c.quizQuestions.find((q) => q.id === 'quiz.budget.needs.b')!;
      for (let i = 0; i < 8; i++) c.quizQuestions.push({ ...clone(base), id: `quiz.budget.extra${i}.b` });
    });
    const qs = assembleQuiz(many, { kind: 'retention' });
    expect(qs.length).toBe(5);
    expect(qs.every((q) => q.form === 'B')).toBe(true);
    // Every pillar appears even though plan_budget has far more questions.
    expect(new Set(qs.map((q) => q.pillar))).toEqual(new Set(PILLARS));
    expect(assembleQuiz(content, { kind: 'retention' }).length).toBe(5);
  });
});

describe('scoreQuiz', () => {
  const qs = assembleQuiz(content, { kind: 'baseline' });
  const allRight = Object.fromEntries(qs.map((q) => [q.id, q.answer]));

  it('scores all correct as 100 with per-pillar totals and feedback', () => {
    const r = scoreQuiz(qs, allRight);
    expect(QuizResult.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({ correct: 5, total: 5, score: 100 });
    expect(r.byPillar.understand_investing).toEqual({ correct: 2, total: 2 });
    expect(r.feedback.length).toBe(5);
    expect(r.feedback.every((f) => f.correct)).toBe(true);
    expect(r.feedback[0]!.explanation).toBe(qs[0]!.explanation);
  });

  it('counts unanswered and wrong answers as wrong', () => {
    const q0 = qs[0]!;
    const r = scoreQuiz(qs, { [q0.id]: q0.answer, [qs[1]!.id]: (qs[1]!.answer + 1) % qs[1]!.options.length });
    expect(r.correct).toBe(1);
    expect(r.score).toBe(20);
    expect(r.byPillar.save_manage).toEqual({ correct: 0, total: 1 });
    expect(r.feedback.filter((f) => !f.correct).length).toBe(4);
  });

  it('rounds the percentage', () => {
    const three = qs.slice(0, 3);
    const two = Object.fromEntries(three.slice(0, 2).map((q) => [q.id, q.answer]));
    expect(scoreQuiz(three, two).score).toBe(67);
  });

  it('is 0 for no questions or no answers', () => {
    expect(scoreQuiz([], {})).toMatchObject({ correct: 0, total: 0, score: 0, byPillar: {}, feedback: [] });
    expect(scoreQuiz(qs, {}).score).toBe(0);
  });

  it('does not mutate its inputs', () => {
    const before = JSON.stringify(qs);
    scoreQuiz(qs, allRight);
    expect(JSON.stringify(qs)).toBe(before);
  });
});
