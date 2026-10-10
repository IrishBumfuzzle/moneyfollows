// Event payloads built from game results, kept apart from the screens so they can be tested
// against what push_events keeps (supabase migrations; CLAUDE.md 5.5).
import type { QuizResult } from '../features/classroom/quiz';

/**
 * `quiz_submitted` for a finished quiz of any kind (classroom, baseline, endline). The server
 * rebuilds each answer as exactly {questionId, pillar, choice, correct}, so send just those;
 * `choice` is the option's index in the un-shuffled content order.
 */
export function quizSubmittedPayload(r: QuizResult) {
  return {
    quiz_type: r.kind,
    quiz_id: r.quizId,
    score: r.score,
    answers: r.answers.map(({ questionId, pillar, choice, correct }) => ({ questionId, pillar, choice, correct })),
  };
}
