import { describe, expect, it } from 'vitest';
import { ASSESSMENT_BANK, CLASSROOM_BANK } from '../features/classroom/content';
import {
  answerQuestion as answer,
  currentQuestion,
  isQuizFinished as isFinished,
  nextQuestion as next,
  quizResult as result,
  startQuiz,
} from '@paisa/engine';
import type { QuizOptions } from '@paisa/engine';
import { PILLARS } from '@paisa/shared';
import type { QuizQuestion } from '@paisa/shared';
import { quizSubmittedPayload } from './payloads';

/** Plays a whole quiz, answering every other question right. */
function played(bank: QuizQuestion[], opts: QuizOptions) {
  let s = startQuiz(bank, opts);
  for (let i = 0; !isFinished(s); i++) {
    const q = currentQuestion(s)!;
    s = next(answer(s, i % 2 === 0 ? q.answer : (q.answer + 1) % q.options.length).session);
  }
  return result(s);
}

/** push_events' quiz_payload_ok (supabase/migrations/20261010230000_classroom_quiz_events.sql), as code. */
function serverAccepts(p: ReturnType<typeof quizSubmittedPayload>): boolean {
  if (!['baseline', 'endline', 'classroom'].includes(p.quiz_type)) return false;
  if (!Number.isInteger(p.score) || p.score < 0 || p.score > 100) return false;
  if (p.answers.length < 1 || p.answers.length > 24) return false;
  return p.answers.every(
    (a) =>
      Object.keys(a).sort().join() === 'choice,correct,pillar,questionId' &&
      typeof a.correct === 'boolean' &&
      typeof a.choice === 'number' &&
      a.questionId.length >= 1 &&
      a.questionId.length <= 64 &&
      PILLARS.includes(a.pillar),
  );
}

describe('quizSubmittedPayload', () => {
  const rounds = [
    { name: 'classroom', r: () => played(CLASSROOM_BANK, { kind: 'classroom', seed: 5, count: 5 }) },
    { name: 'baseline', r: () => played(ASSESSMENT_BANK, { kind: 'baseline', seed: 5, quizId: 'baseline', feedback: 'end' }) },
    { name: 'endline', r: () => played(ASSESSMENT_BANK, { kind: 'endline', seed: 5, quizId: 'endline', feedback: 'end' }) },
  ];

  it.each(rounds)('$name: is a payload the server accepts and keeps whole', ({ name, r }) => {
    const result = r();
    const p = quizSubmittedPayload(result);
    expect(p).toMatchObject({ quiz_type: name, quiz_id: name, score: result.score });
    expect(p.answers).toHaveLength(result.total);
    expect(serverAccepts(p)).toBe(true);
    // push_events keeps quiz_id only if it is id-like, and caps this event at 4 KB.
    expect(p.quiz_id).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
    expect(JSON.stringify(p).length).toBeLessThan(4096);
  });

  it('sends only the four answer keys, in the content order the student saw the options in', () => {
    const result = rounds[0]!.r();
    const noisy = { ...result, answers: result.answers.map((a) => ({ ...a, extra: 'x' })) };
    for (const a of quizSubmittedPayload(noisy).answers) {
      expect(Object.keys(a)).toEqual(['questionId', 'pillar', 'choice', 'correct']);
    }
  });
});
