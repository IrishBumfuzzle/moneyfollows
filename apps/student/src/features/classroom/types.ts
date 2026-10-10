// Mirror of the quiz types in packages/shared (origin/Backend, CLAUDE.md 5.1/5.5).
// `packages/shared` is not on main yet; when it lands, delete this file and import
// from '@paisa/shared'. The only addition is QuizKind 'classroom' (see API.md).

export type Lang = 'en' | 'hi' | 'te' | 'ur';
export type Pillar = 'plan_budget' | 'save_manage' | 'understand_investing' | 'stay_safe';
export type TKey = `t:${string}`;

export const PILLARS: readonly Pillar[] = ['plan_budget', 'save_manage', 'understand_investing', 'stay_safe'];

/** Additive: 'classroom' is the practice quiz played at School. Backend has baseline | endline. */
export type QuizKind = 'baseline' | 'endline' | 'classroom';

export interface QuizQuestion {
  id: string;                  // e.g. "quiz.classroom.save.emergency_fund"
  quiz: QuizKind;
  pillar: Pillar;
  concept: string;
  text: TKey;
  options: TKey[];             // 2–4
  answer: number;              // index into options
  explanation: TKey;
  meta: { status: 'draft' | 'reviewed'; author: string };
}

/** One answer as stored in quiz_attempts.answers / the quiz_submitted payload. */
export interface QuizAnswer {
  questionId: string;
  pillar: Pillar;
  choice: number;              // index into the content's options (un-shuffled order)
  correct: boolean;
}

export interface SyncEvent {
  event_id: string;
  anon_id: string;
  class_id: string;
  type: 'quiz_submitted';      // narrowed: the quiz module only emits this one
  payload: Record<string, unknown>;
  client_ts: string;
  content_version: string;
}
