import { z } from 'zod';
import {
  ChoiceRating,
  ContentId,
  Difficulty,
  Flag,
  JarBalances,
  JarId,
  JarSplit,
  PersonaId,
  Pillar,
  Rupees,
  TKey,
} from './content';
import { EventType } from './events';

/** Signed change per jar. Only jars that changed are present. */
export const JarDeltas = z.partialRecord(JarId, Rupees);
export type JarDeltas = z.infer<typeof JarDeltas>;

/** A delayed effect waiting for its week. `due` is the absolute week index (month 1 week 1 = 1). */
export const PendingEffect = z.strictObject({
  due: z.int().min(1),
  sourceId: ContentId,
  deltas: JarDeltas,
  debt: Rupees,
  text: TKey,
});
export type PendingEffect = z.infer<typeof PendingEffect>;

/** What happened when effects were applied, after borrowing to cover any shortfall. */
export const AppliedEffects = z.strictObject({
  deltas: JarDeltas,
  debt: Rupees,
  /** Part of `debt` that was borrowed automatically because a jar ran dry. */
  borrowed: Rupees.min(0),
});
export type AppliedEffects = z.infer<typeof AppliedEffects>;

/** The result of the last choice, kept in state so the consequence view can be re-rendered. */
export const Outcome = z.strictObject({
  cardId: ContentId,
  cardKind: z.enum(['decision', 'event']),
  choiceId: z.string(),
  applied: AppliedEffects,
  lesson: TKey,
  /** Delayed effects this choice queued, so the sheet can hint that more is coming. */
  queued: z.int().min(0),
});
export type Outcome = z.infer<typeof Outcome>;

export const NOTICE_KINDS = ['payday', 'fixed_costs', 'delayed_effect', 'borrowed', 'goal_milestone', 'badge', 'month_start'] as const;

/** Something that happened between two views (payday, a delayed effect landing, a badge). */
export const Notice = z.strictObject({
  kind: z.enum(NOTICE_KINDS),
  text: TKey.optional(),
  deltas: JarDeltas.optional(),
  debt: Rupees.optional(),
  amount: Rupees.optional(),
  /** Milestone percentage or badge id, depending on `kind`. */
  value: z.union([z.int(), z.string()]).optional(),
});
export type Notice = z.infer<typeof Notice>;

export const ScoreParts = z.strictObject({
  savingsRate: z.number().min(0).max(1),
  emergencyFund: z.number().min(0).max(1),
  goalProgress: z.number().min(0).max(1),
  /** 1 means no debt, 0 means debt of a month's income or more. */
  debtFree: z.number().min(0).max(1),
});
export type ScoreParts = z.infer<typeof ScoreParts>;

export const MonthReport = z.strictObject({
  month: z.int().min(1),
  score: z.int().min(0).max(100),
  parts: ScoreParts,
  income: Rupees,
  saved: Rupees,
  reflection: z.strictObject({ id: ContentId, question: TKey, options: z.array(TKey) }),
});
export type MonthReport = z.infer<typeof MonthReport>;

export const DecisionRecord = z.strictObject({
  month: z.int().min(1),
  week: z.int().min(1),
  cardId: ContentId,
  cardKind: z.enum(['decision', 'event']),
  pillar: Pillar,
  concept: z.string(),
  choiceId: z.string(),
  rating: ChoiceRating.optional(),
});
export type DecisionRecord = z.infer<typeof DecisionRecord>;

export const GAME_PHASES = ['card', 'consequence', 'month_end', 'done'] as const;
export const GamePhase = z.enum(GAME_PHASES);
export type GamePhase = z.infer<typeof GamePhase>;

const gameStateShape = {
  version: z.literal(1),
  personaId: PersonaId,
  level: Difficulty,
  seed: z.int(),
  /** mulberry32 state (uint32). Snapshotted with everything else, so rewinds replay the same draws. */
  rng: z.int().min(0),
  month: z.int().min(1),
  week: z.int().min(1),
  phase: GamePhase,
  /** The card on screen in the `card` phase. */
  card: z.strictObject({ kind: z.enum(['decision', 'event']), id: ContentId }).nullable(),
  /** Whether this week's decision card has been played (an event can come before it). */
  decided: z.boolean(),
  jars: JarBalances,
  debt: Rupees.min(0),
  split: JarSplit,
  goal: z.strictObject({ label: TKey, amount: Rupees.positive() }),
  flags: z.array(Flag),
  /** Scenario and event ids already shown, oldest first. */
  seen: z.array(ContentId),
  pending: z.array(PendingEffect),
  rewindTokens: z.int().min(0),
  /** Totals since payday, for the month-end score. */
  monthStart: z.strictObject({ jars: JarBalances, debt: Rupees.min(0), income: Rupees.min(0) }),
  decisions: z.array(DecisionRecord),
  lastOutcome: Outcome.nullable(),
  notices: z.array(Notice),
  report: MonthReport.nullable(),
  scores: z.array(z.int().min(0).max(100)),
  milestones: z.array(z.int()),
  xp: z.int().min(0),
  badges: z.array(z.string()),
  /** Lesson cards collected so far ("My Notes"). */
  lessons: z.array(TKey),
};

/** The state before the last choice, without its own snapshot. */
export const GameSnapshot = z.strictObject(gameStateShape);
export type GameSnapshot = z.infer<typeof GameSnapshot>;

/** The whole saved game. Plain JSON: `JSON.parse(JSON.stringify(state))` round-trips. (v0.2) */
export const GameState = z.strictObject({
  ...gameStateShape,
  snapshot: GameSnapshot.nullable(),
});
export type GameState = z.infer<typeof GameState>;

export const NewGameInput = z.strictObject({
  personaId: PersonaId,
  level: Difficulty,
  seed: z.int(),
});
export type NewGameInput = z.infer<typeof NewGameInput>;

export const Action = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('choose'), choiceId: z.string() }),
  z.strictObject({ type: z.literal('rewind') }),
  /**
   * Leave the consequence sheet or the month-end report. At month end the
   * player may answer the reflection and set next month's jar split.
   */
  z.strictObject({
    type: z.literal('advance'),
    reflection: z.int().min(0).optional(),
    split: JarSplit.optional(),
  }),
]);
export type Action = z.infer<typeof Action>;

export const Hud = z.strictObject({
  month: z.int(),
  week: z.int(),
  months: z.int(),
  jars: JarBalances,
  debt: Rupees,
  goal: z.strictObject({ label: TKey, amount: Rupees, progress: z.number().min(0).max(1) }),
  rewindTokens: z.int(),
  canRewind: z.boolean(),
  xp: z.int(),
  badges: z.array(z.string()),
  lastScore: z.int().nullable(),
});
export type Hud = z.infer<typeof Hud>;

export const CardView = z.strictObject({
  kind: z.enum(['decision', 'event']),
  id: ContentId,
  pillar: Pillar,
  text: TKey,
  illustration: z.string().optional(),
  assumption: z.boolean(),
  choices: z.array(z.strictObject({ id: z.string(), label: TKey, icon: z.string().optional() })),
});
export type CardView = z.infer<typeof CardView>;

export const YearSummary = z.strictObject({
  scores: z.array(z.int()),
  averageScore: z.int(),
  goalReached: z.boolean(),
  badges: z.array(z.string()),
  decisions: z.int(),
});
export type YearSummary = z.infer<typeof YearSummary>;

/** What the client renders now. A pure function of the state and the pack. (v0.2) */
export const View = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('card'), hud: Hud, notices: z.array(Notice), card: CardView }),
  z.strictObject({ kind: z.literal('consequence'), hud: Hud, notices: z.array(Notice), outcome: Outcome }),
  z.strictObject({ kind: z.literal('month_end'), hud: Hud, notices: z.array(Notice), report: MonthReport }),
  z.strictObject({ kind: z.literal('done'), hud: Hud, notices: z.array(Notice), summary: YearSummary }),
]);
export type View = z.infer<typeof View>;

/** A domain event from the engine. The API stamps an id and time and stores it like a synced event. */
export const GameEvent = z.strictObject({
  type: EventType,
  payload: z.record(z.string(), z.unknown()),
});
export type GameEvent = z.infer<typeof GameEvent>;

export const StepResult = z.strictObject({ state: GameState, view: View, events: z.array(GameEvent) });
export type StepResult = z.infer<typeof StepResult>;

/** Time Machine output: always three outcomes and the assumptions behind them, never one number. */
export const Projection = z.strictObject({
  assumptions: z.strictObject({
    monthlyAmount: Rupees,
    rates: z.strictObject({ bad: z.number(), average: z.number(), good: z.number() }),
    compounding: z.literal('monthly'),
    note: TKey,
  }),
  points: z.array(
    z.strictObject({
      years: z.int().min(0),
      invested: Rupees,
      bad: Rupees,
      average: Rupees,
      good: Rupees,
    }),
  ),
});
export type Projection = z.infer<typeof Projection>;

export const QuizResult = z.strictObject({
  correct: z.int().min(0),
  total: z.int().min(0),
  /** 0–100. */
  score: z.int().min(0).max(100),
  byPillar: z.partialRecord(Pillar, z.strictObject({ correct: z.int(), total: z.int() })),
  feedback: z.array(z.strictObject({ questionId: ContentId, correct: z.boolean(), explanation: TKey })),
});
export type QuizResult = z.infer<typeof QuizResult>;
