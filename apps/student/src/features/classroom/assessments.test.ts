// The start- and end-of-term checks come straight from packages/content (quizzes/baseline.json
// and endline.json); these tests pin what the classroom relies on and what the server accepts.
import { describe, expect, it } from 'vitest';
import {
  answerQuestion as answer,
  isQuizFinished as isFinished,
  nextQuestion as next,
  quizResult as result,
  quizSubmittedEvent as toSubmittedEvent,
  startQuiz,
} from '@paisa/engine';
import type { QuizSession } from '@paisa/engine';
import { PILLARS } from '@paisa/shared';
import type { QuizType as QuizKind } from '@paisa/shared';
import { ASSESSMENT_BANK, STRINGS } from './content';

describe('assessment strings', () => {
  it.each(['en', 'hi'] as const)('every check question and option has %s text', (lang) => {
    for (const q of ASSESSMENT_BANK) {
      for (const k of [q.text, ...q.options, q.explanation]) expect(STRINGS[lang]![k.slice(2)], `${lang} ${k}`).toBeTruthy();
    }
  });
});


describe('assessment quizzes', () => {
  const play = (kind: 'baseline' | 'endline', pick: (s: QuizSession) => number): QuizSession => {
    let s = startQuiz(ASSESSMENT_BANK, { kind, seed: 7, quizId: kind, feedback: 'end' });
    while (!isFinished(s)) s = next(answer(s, pick(s)).session);
    return s;
  };

  it.each(['baseline', 'endline'] as const)('%s uses all 6 of its questions, across all four pillars, and only its own', (kind) => {
    const s = startQuiz(ASSESSMENT_BANK, { kind, seed: 1, quizId: kind, feedback: 'end' });
    expect(s.questions).toHaveLength(6);
    expect(new Set(s.questions.map((q) => q.id)).size).toBe(6);
    expect(new Set(s.questions.map((q) => q.pillar))).toEqual(new Set(PILLARS));
    expect(s.questions.every((q) => q.quiz === (kind as QuizKind))).toBe(true);
    expect(s.feedback).toBe('end');
  });

  it('reveals nothing while playing', () => {
    const s = startQuiz(ASSESSMENT_BANK, { kind: 'baseline', seed: 1, quizId: 'baseline', feedback: 'end' });
    const { feedback } = answer(s, s.questions[0]!.answer);
    expect(feedback.correct).toBe(true);
    expect(feedback.correctChoice).toBeNull();
    expect(feedback.explanation).toBeNull();
  });

  it.each(['baseline', 'endline'] as const)('%s result is a quiz_submitted the server accepts', (kind) => {
    const r = result(play(kind, (s) => s.questions[s.index]!.answer));
    expect(r).toMatchObject({ kind, quizId: kind, score: 100, correct: 6, total: 6 });
    const ev = toSubmittedEvent(r, { event_id: 'e', anon_id: 'a', class_id: 'c', client_ts: '2026-10-11T00:00:00.000Z', content_version: 'v' });
    const p = ev.payload as { quiz_type: string; quiz_id: string; score: number; answers: { questionId: string; choice: number; correct: boolean }[] };
    // The server drops string payload values that are not ^[A-Za-z0-9_.:-]{1,64}$ (and rejects the event).
    const idLike = /^[A-Za-z0-9_.:-]{1,64}$/;
    expect(p.quiz_type).toBe(kind);
    expect(idLike.test(p.quiz_id)).toBe(true);
    expect(p.answers).toHaveLength(6);
    for (const a of p.answers) {
      expect(idLike.test(a.questionId)).toBe(true);
      expect(typeof a.choice).toBe('number');
      expect(typeof a.correct).toBe('boolean');
    }
    expect(JSON.stringify(p).length).toBeLessThan(4096);
  });

  it('scores a wrong-everywhere run as 0 with a split across all four pillars', () => {
    const r = result(play('baseline', (s) => (s.questions[s.index]!.answer + 1) % s.questions[s.index]!.options.length));
    expect(r.score).toBe(0);
    expect(Object.keys(r.byPillar).sort()).toEqual([...PILLARS].sort());
  });
});
