// Core types: CLAUDE.md section 5.1 (frozen at v0). Additions below the v0 block are
// additive and announced; see packages/shared/CHANGELOG.md.

export type Lang = 'en' | 'hi' | 'te' | 'ur';
export type PersonaId = 'ravi' | 'sana' | 'kiran' | 'lakshmi';
export type Pillar = 'plan_budget' | 'save_manage' | 'understand_investing' | 'stay_safe';
export type Level = 'starter' | 'explorer' | 'planner';
export type JarId = 'needs' | 'wants' | 'goals' | 'savings';
export type TKey = `t:${string}`; // translation key, resolved in the UI

// Money is whole rupees (integers). Never use floats for money.
export interface Effects {
  jars?: Partial<Record<JarId, number>>; // + adds, − spends
  debt?: number; // + borrows, − repays
  flags?: string[]; // set story flags
}

export interface DelayedEffect {
  afterWeeks: number;
  effects: Effects;
  note: TKey;
}

export interface Choice {
  id: string;
  label: TKey;
  icon?: string;
  effects: Effects;
  delayed?: DelayedEffect[];
  lesson: TKey; // one sentence + "what this means"
  /** Additive: how the choice reads against the lesson. Never shown as right/wrong. */
  rating?: 'best' | 'ok' | 'risky';
}

export interface Scenario {
  id: string; // e.g. "budget.recharge.01"
  pillar: Pillar;
  concept: string;
  personas: PersonaId[];
  difficulty: 1 | 2 | 3;
  text: TKey;
  illustration?: string;
  requiresFlag?: string;
  assumption?: boolean; // true => must render AssumptionBanner
  choices: Choice[]; // 2–4
  meta: { status: 'draft' | 'reviewed'; author: string };
}

export interface PendingEffect {
  dueMonth: number;
  dueWeek: number;
  effects: Effects;
  note: TKey;
}

export interface GameState {
  version: 1;
  personaId: PersonaId;
  level: Level;
  seed: number;
  month: number; // 1-based
  week: number; // 1–4
  jars: Record<JarId, number>;
  debt: number;
  goal: { amount: number; progress: number };
  flags: string[];
  seen: string[]; // scenario ids
  pending: PendingEffect[];
  rewindTokens: number;
  history: unknown[]; // snapshots for rewind (engine-internal)
  score?: number; // Money Health Score, set at month end

  // ---- Additive (engine-internal, optional so v0 states still type-check) ----
  /** Which card nextCard shows. Absent means 'decision'. */
  stage?: Stage;
  /** Balances and income at payday, for the month-end score. */
  monthStart?: { jars: Record<JarId, number>; debt: number; income: number; needsBudget: number };
  /** Money Health Score of every finished month, oldest first. */
  scores?: number[];
  /** Lesson cards collected so far ("My Notes"). */
  lessons?: TKey[];
}

// ---------------------------------------------------------------------------
// Additive types referenced by the engine API (5.2) and backend API (5.5).
// ---------------------------------------------------------------------------

export type Stage = 'event' | 'decision' | 'monthEnd' | 'yearEnd';

/** A surprise life event. Same shape as a Scenario, but 1–4 choices and a draw weight. */
export interface EventCard extends Omit<Scenario, 'choices' | 'difficulty'> {
  levels: Level[];
  weight: number;
  choices: Choice[]; // 1–4; one choice is an "OK" card
}

export interface Persona {
  id: PersonaId;
  name: TKey;
  bio: TKey;
  goal: { label: TKey; amount: number };
  income:
    | { pattern: 'steady'; amount: number }
    | { pattern: 'seasonal'; amount: number; multipliers: number[] } // 12 values, month 1 first
    | { pattern: 'irregular'; min: number; max: number; step: number };
  /** Fixed monthly costs taken from Needs on payday (bus pass, family contribution). */
  fixedCosts: number;
  startingJars: Record<JarId, number>;
  /** Payday split in whole percentages that add up to 100. */
  split: Record<JarId, number>;
  meta: { status: 'draft' | 'reviewed'; author: string };
}

export type QuizType = 'baseline' | 'endline';

export interface QuizQuestion {
  id: string;
  quiz: QuizType;
  pillar: Pillar;
  concept: string;
  text: TKey;
  options: TKey[]; // 2–4
  answer: number; // index into options
  explanation: TKey;
  meta: { status: 'draft' | 'reviewed'; author: string };
}

/** One answer as stored in quiz_attempts.answers, so learning gains can be split by pillar. */
export interface QuizAnswer {
  questionId: string;
  pillar: Pillar;
  choice: number;
  correct: boolean;
}

/** Scam or Safe? card. Suspicious segments carry the reason shown in the Message Inspector. */
export interface ScamMessage {
  id: string;
  channel: 'sms' | 'whatsapp' | 'call' | 'qr';
  levels: Level[];
  sender: TKey;
  segments: { text: TKey; suspicious?: TKey }[];
  verdict: 'scam' | 'safe';
  explanation: TKey;
  meta: { status: 'draft' | 'reviewed'; author: string };
}

/** Everything the engine and mini-games read. Bundled with the app as static JSON. */
export interface ContentBundle {
  version: string;
  personas: Persona[];
  scenarios: Scenario[];
  events: EventCard[];
  quizzes: QuizQuestion[];
  scamMessages: ScamMessage[];
}

export interface ScoreParts {
  /** Savings rate against the 20% target. */
  s: number;
  /** Savings jar divided by one month of Needs. */
  e: number;
  /** Goal progress. */
  g: number;
  /** Debt divided by monthly income. */
  d: number;
}

export interface MonthReport {
  score: number;
  parts: ScoreParts;
  reflection: TKey;
}

export type Card =
  | { kind: 'decision'; month: number; week: number; scenario: Scenario }
  | { kind: 'event'; month: number; week: number; scenario: EventCard }
  | { kind: 'monthEnd'; month: number; report: MonthReport }
  | { kind: 'yearEnd'; scores: number[]; goalReached: boolean };

/** Jar and debt changes after borrowing to cover any shortfall. */
export interface AppliedEffects {
  jars: Partial<Record<JarId, number>>;
  debt: number;
  /** Part of `debt` borrowed automatically because a jar ran dry. */
  borrowed: number;
}

export interface Consequence {
  card: Card['kind'];
  scenarioId?: string;
  choiceId: string;
  lesson?: TKey;
  applied: AppliedEffects;
  /** Delayed effects this choice queued, so the sheet can hint that more is coming. */
  delayedQueued: number;
  /** Delayed effects that landed as the next week began. */
  landed: { note: TKey; applied: AppliedEffects }[];
  /** Set when this step started a new month. */
  payday?: { income: number; applied: AppliedEffects };
}

export interface GrowthRates {
  low: number;
  avg: number;
  high: number;
}

/** Time Machine series: value at the end of year 0..n for each assumed rate. Never one number. */
export interface Projection {
  low: number[];
  avg: number[];
  high: number[];
}

// ---------------------------------------------------------------------------
// Backend API (5.5)
// ---------------------------------------------------------------------------

export type SyncEventType =
  | 'app_open'
  | 'onboarding_complete'
  | 'persona_selected'
  | 'decision_made'
  | 'rewind_used'
  | 'event_triggered'
  | 'minigame_complete'
  | 'quiz_submitted'
  | 'module_complete'
  | 'badge_earned'
  | 'language_changed'
  | 'sync_complete';

export interface SyncEvent {
  event_id: string; // uuid, generated on device
  anon_id: string;
  class_id: string;
  type: SyncEventType;
  payload: Record<string, unknown>;
  client_ts: string; // ISO
  content_version: string;
}

export interface JoinClassResult {
  anon_id: string;
  class_id: string;
  default_lang: Lang;
}

export interface PushEventsResult {
  accepted: number;
}

export interface ClassProgressRow {
  anon_id: string;
  nickname: string;
  modules_done: number;
  last_active: string | null;
  // Additive columns:
  lang: Lang;
  decisions: number;
  /** Decisions per pillar, for the progress table. */
  pillars: Record<Pillar, number>;
  baseline_score: number | null;
  endline_score: number | null;
}

export interface LearningGainRow {
  pillar: Pillar;
  baseline_avg: number | null; // percent correct
  endline_avg: number | null;
  baseline_n: number;
  endline_n: number;
}
