// Feeds the learning store from the rest of the game: answered events and finished quizzes.
import type { QuizResult } from '@paisa/engine';
import type { Guide } from '@paisa/shared';
import { getEvent } from '../events/data';
import { conceptById, questionById } from './content';
import { addNote, finishGuide, learn, meet, understand, type LearningState } from './store';

/** The app's events (features/events/data.ts) carry no concept tag, so they are mapped here. */
export const EVENT_CONCEPTS: Readonly<Record<string, string>> = {
  'event.injury.01': 'emergency_fund',
  'phone.kyc.01': 'kyc',
  'phone.tuition.01': 'job_offer_fee',
  'phone.lottery.01': 'lottery_scam',
  'phone.savings_club.01': 'hot_tips',
  'phone.double.01': 'risk_return',
  'phone.shop_shift.01': 'opportunity_cost',
  'phone.otp.01': 'never_share_otp',
  'call.bank_officer.01': 'never_share_otp',
  'call.ammi_groceries.01': 'needs_vs_wants',
};

const bare = (key: string) => (key.startsWith('t:') ? key.slice(2) : key);

/** An answered event: its concept is met and its lesson goes into the Notebook. */
export function eventLesson(s: LearningState, id: string, choiceId: string, at: string): LearningState {
  const choice = getEvent(id)?.choices.find((c) => c.id === choiceId);
  if (!choice) return s;
  const concept = EVENT_CONCEPTS[id] ?? null;
  const pillar = (concept && conceptById.get(concept)?.pillar) || null;
  return addNote(meet(s, [concept], at), { key: bare(choice.lesson), source: 'event', concept, pillar, at });
}

/**
 * A finished quiz: each question's concept is met, and understood when answered right. Practice
 * rounds also add their explanations to the Notebook. The start- and end-of-term checks don't, so the
 * Notebook never turns into an answer sheet for the end-line quiz that measures learning gain.
 */
export function quizLessons(s: LearningState, r: Pick<QuizResult, 'kind' | 'answers'>, at: string): LearningState {
  let next = s;
  for (const a of r.answers) {
    const q = questionById(a.questionId);
    if (!q) continue;
    next = a.correct ? understand(next, [q.concept], at) : meet(next, [q.concept], at);
    if (r.kind === 'classroom')
      next = addNote(next, { key: bare(q.explanation), source: 'classroom', concept: q.concept, pillar: q.pillar, at });
  }
  return next;
}

/** A guide's check answered: the guide is recorded (first answer counts) and its explanation is noted. */
export function guideLesson(s: LearningState, guide: Guide, correct: boolean, at: string): LearningState {
  const note = {
    key: bare(guide.check.explanation),
    source: 'guide' as const,
    concept: guide.concepts[0] ?? null,
    pillar: guide.pillar,
    at,
  };
  return addNote(finishGuide(s, guide, correct, at), note);
}

export const learnFromEvent = (id: string, choiceId: string) => learn((s, at) => eventLesson(s, id, choiceId, at));
export const learnFromQuiz = (r: Pick<QuizResult, 'kind' | 'answers'>) => learn((s, at) => quizLessons(s, r, at));
