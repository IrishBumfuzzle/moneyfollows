import { PILLARS } from '@paisa/shared';
import type { ContentBundle, QuizAnswer, QuizQuestion, QuizType } from '@paisa/shared';

/** Questions of one quiz, ordered by pillar (PILLARS order) then id. */
export function quizFor(content: ContentBundle, quiz: QuizType): QuizQuestion[] {
  return content.quizzes
    .filter((q) => q.quiz === quiz)
    .sort((a, b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
