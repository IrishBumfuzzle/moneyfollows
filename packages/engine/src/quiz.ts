import { PILLARS } from '@paisa/shared';
import type { ContentBundle, QuizAnswer, QuizQuestion, QuizType } from '@paisa/shared';
import { unit } from './hash';

/**
 * A copy of `q` with its options in a seeded order and `answer` re-pointed at the same
 * option. Fisher–Yates driven by the engine hash, so the same (seed, question) always gives
 * the same order. Counters answer-position bias.
 */
export function shuffleOptions(q: QuizQuestion, seed: number): QuizQuestion {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(unit(seed, 'quizopt', q.id, i) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { ...q, options: order.map((i) => q.options[i]!), answer: order.indexOf(q.answer) };
}

/**
 * Questions of one quiz, ordered by pillar (PILLARS order) then id. With `shuffleSeed`
 * (e.g. derived from the student's anon id), each question's options come in a
 * deterministic shuffled order; score answers against the questions this returns.
 */
export function quizFor(content: ContentBundle, quiz: QuizType, shuffleSeed?: number): QuizQuestion[] {
  const questions = content.quizzes
    .filter((q) => q.quiz === quiz)
    .sort((a, b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return shuffleSeed === undefined ? questions : questions.map((q) => shuffleOptions(q, shuffleSeed));
}

/**
 * Scores a quiz. `answers` maps question id to the chosen option index. A missing answer
 * counts as wrong and is left out of the returned QuizAnswer[] (the stored shape needs a
 * real option index), but still counts in `total`.
 */
export function scoreQuiz(
  questions: QuizQuestion[],
  answers: Record<string, number>,
): { score: number; correct: number; total: number; answers: QuizAnswer[] } {
  const stored: QuizAnswer[] = [];
  let correct = 0;
  for (const q of questions) {
    const choice = answers[q.id];
    if (choice === undefined) continue;
    const ok = choice === q.answer;
    if (ok) correct++;
    stored.push({ questionId: q.id, pillar: q.pillar, choice, correct: ok });
  }
  const total = questions.length;
  return { score: total === 0 ? 0 : Math.round((100 * correct) / total), correct, total, answers: stored };
}
