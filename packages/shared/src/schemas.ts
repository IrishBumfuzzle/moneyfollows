// zod schemas for the content files and the sync API. Each matches its type in
// types.ts; test/schemas.test.ts checks that they stay in step.
import { z } from 'zod';
import { MAX_DELAY_WEEKS, REWIND_TOKENS_PER_MONTH, WEEKS_PER_MONTH } from './constants';

export const LangSchema = z.enum(['en', 'hi', 'te', 'ur']);
export const PersonaIdSchema = z.enum(['ravi', 'sana', 'kiran', 'lakshmi']);
export const PillarSchema = z.enum(['plan_budget', 'save_manage', 'understand_investing', 'stay_safe']);
export const LevelSchema = z.enum(['starter', 'explorer', 'planner']);
export const JarIdSchema = z.enum(['needs', 'wants', 'goals', 'savings']);
export const LocationIdSchema = z.enum(['home', 'convenience', 'school', 'hospital', 'bank']);
/** A sub-map location: "<place>.<name>", e.g. convenience.phone_shop. */
export const SublocationSchema = z.string().regex(/^(home|convenience|school|hospital|bank)\.[a-z0-9_]+$/);

/**
 * "t:" plus a dotted key, e.g. t:budget.recharge.01.story. Segments after the first may also
 * use capitals and hyphens, for edition keys like t:news.2026-W41.upi_fraud.headline (5.7).
 */
export const TKeySchema = z
  .string()
  .regex(/^t:[a-z0-9_]+(\.[A-Za-z0-9_-]+)*$/)
  .transform((s) => s as `t:${string}`);

export const ContentIdSchema = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
const Rupees = z.int();
/** Story flag names: set by Effects.flags and tested by requiresFlag. */
export const FlagSchema = z.string().regex(/^[a-z0-9_]+$/);
/** A game seed: an integer in the uint32 range (the hash works on 32 bits). */
export const SeedSchema = z.int().min(0).max(0xffffffff);
const MetaSchema = z.strictObject({ status: z.enum(['draft', 'reviewed']), author: z.string().min(1) });

export const EffectsSchema = z.strictObject({
  jars: z.partialRecord(JarIdSchema, Rupees).optional(),
  debt: Rupees.optional(),
  flags: z.array(FlagSchema).optional(),
});

export const DelayedEffectSchema = z.strictObject({
  // At most MAX_DELAY_WEEKS (11), so an effect queued in week 1 still lands inside the game.
  afterWeeks: z.int().min(1).max(MAX_DELAY_WEEKS),
  effects: EffectsSchema,
  note: TKeySchema,
});

export const ChoiceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]{1,16}$/),
  label: TKeySchema,
  icon: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  effects: EffectsSchema,
  delayed: z.array(DelayedEffectSchema).optional(),
  lesson: TKeySchema,
  rating: z.enum(['best', 'ok', 'risky']).optional(),
});

const uniqueChoices = (s: { choices: { id: string }[] }) =>
  new Set(s.choices.map((c) => c.id)).size === s.choices.length;
/** A sub-map location must belong to the card's place: convenience.phone_shop needs location convenience. */
const sublocationInPlace = (s: { location: string; sublocation?: string | undefined }) =>
  s.sublocation === undefined || s.sublocation.startsWith(`${s.location}.`);
const SUBLOCATION_MESSAGE = {
  message: 'sublocation must start with the location, e.g. convenience.phone_shop',
  path: ['sublocation'],
};

const cardFields = {
  id: ContentIdSchema,
  pillar: PillarSchema,
  concept: z.string().regex(/^[a-z0-9_]+$/),
  location: LocationIdSchema,
  sublocation: SublocationSchema.optional(),
  channel: z.enum(['in_person', 'phone']),
  speaker: TKeySchema,
  personas: z.array(PersonaIdSchema).min(1),
  text: TKeySchema,
  illustration: z.string().optional(),
  requiresFlag: FlagSchema.optional(),
  assumption: z.boolean().optional(),
  meta: MetaSchema,
};

export const ScenarioSchema = z
  .strictObject({
    ...cardFields,
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    choices: z.array(ChoiceSchema).min(2).max(4),
  })
  .refine(uniqueChoices, { message: 'choice ids must be unique', path: ['choices'] })
  .refine(sublocationInPlace, SUBLOCATION_MESSAGE);

export const EventCardSchema = z
  .strictObject({
    ...cardFields,
    levels: z.array(LevelSchema).min(1),
    weight: z.number().positive().max(100),
    choices: z.array(ChoiceSchema).min(1).max(4),
  })
  .refine(uniqueChoices, { message: 'choice ids must be unique', path: ['choices'] })
  .refine(sublocationInPlace, SUBLOCATION_MESSAGE);

const JarRecord = z.strictObject({
  needs: Rupees.min(0),
  wants: Rupees.min(0),
  goals: Rupees.min(0),
  savings: Rupees.min(0),
});

export const PersonaSchema = z.strictObject({
  id: PersonaIdSchema,
  name: TKeySchema,
  bio: TKeySchema,
  goal: z.strictObject({ label: TKeySchema, amount: Rupees.positive() }),
  income: z.discriminatedUnion('pattern', [
    z.strictObject({ pattern: z.literal('steady'), amount: Rupees.positive() }),
    z.strictObject({
      pattern: z.literal('seasonal'),
      amount: Rupees.positive(),
      multipliers: z.array(z.number().min(0).max(5)).length(12),
    }),
    z
      .strictObject({
        pattern: z.literal('irregular'),
        min: Rupees.positive(),
        max: Rupees.positive(),
        step: Rupees.positive(),
      })
      .refine((i) => i.min <= i.max, { message: 'irregular income needs min <= max', path: ['max'] }),
  ]),
  fixedCosts: Rupees.min(0),
  startingJars: JarRecord,
  split: JarRecord.refine((s) => s.needs + s.wants + s.goals + s.savings === 100, {
    message: 'split must add up to 100',
  }),
  meta: MetaSchema,
});

export const QuizQuestionSchema = z
  .strictObject({
    id: ContentIdSchema,
    quiz: z.enum(['baseline', 'endline', 'classroom']),
    pillar: PillarSchema,
    concept: z.string().regex(/^[a-z0-9_]+$/),
    text: TKeySchema,
    options: z.array(TKeySchema).min(2).max(4),
    answer: z.int().min(0),
    explanation: TKeySchema,
    meta: MetaSchema,
  })
  .refine((q) => q.answer < q.options.length, { message: 'answer must index an option', path: ['answer'] });

export const ScamMessageSchema = z.strictObject({
  id: ContentIdSchema,
  channel: z.enum(['sms', 'whatsapp', 'call', 'qr']),
  levels: z.array(LevelSchema).min(1),
  sender: TKeySchema,
  segments: z.array(z.strictObject({ text: TKeySchema, suspicious: TKeySchema.optional() })).min(1),
  verdict: z.enum(['scam', 'safe']),
  explanation: TKeySchema,
  meta: MetaSchema,
});

export const QuizAnswerSchema = z.strictObject({
  questionId: z.string(),
  pillar: PillarSchema,
  choice: z.int().min(0),
  correct: z.boolean(),
});

export const SyncEventSchema = z.strictObject({
  event_id: z.uuid(),
  anon_id: z.uuid(),
  class_id: z.uuid(),
  type: z.enum([
    'app_open',
    'onboarding_complete',
    'persona_selected',
    'decision_made',
    'rewind_used',
    'event_triggered',
    'minigame_complete',
    'quiz_submitted',
    'module_complete',
    'badge_earned',
    'language_changed',
    'sync_complete',
    'map_opened',
    'location_selected',
    'week_slept',
    'glossary_term_opened',
    'news_question_answered',
    'news_edition_completed',
  ]),
  payload: z.record(z.string(), z.unknown()),
  client_ts: z.iso.datetime({ offset: true }),
  content_version: z.string().min(1),
});

// ---- Paisa Times and the map (5.1, 5.8) ----

const TermIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export const GlossaryTermSchema = z.strictObject({
  id: TermIdSchema,
  word: TKeySchema,
  simple: TKeySchema,
  example: TKeySchema,
});

export const ArticleSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** ISO week of the edition, e.g. "2026-W41". */
    edition: z.string().regex(/^\d{4}-W\d{2}$/),
    headline: TKeySchema,
    body: TKeySchema,
    terms: z.array(TermIdSchema),
    question: z.strictObject({
      prompt: TKeySchema,
      options: z.array(TKeySchema).min(2).max(4),
      correct: z.int().min(0),
      explanation: TKeySchema,
    }),
    reward: z.strictObject({ wage: Rupees.min(0), xp: z.int().min(0) }),
    meta: z.strictObject({
      status: z.enum(['draft', 'reviewed']),
      author: z.string().min(1),
      factsCheckedBy: z.string().min(1).optional(),
    }),
  })
  .refine((a) => a.question.correct < a.question.options.length, {
    message: 'question.correct must index an option',
    path: ['question', 'correct'],
  });

export const PlaceSchema = z
  .strictObject({
    id: z.union([LocationIdSchema, SublocationSchema]),
    name: TKeySchema,
    parent: LocationIdSchema.optional(),
    position: z.strictObject({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
    illustration: z.string().optional(),
    children: z.array(SublocationSchema).optional(),
    unlock: z.strictObject({ month: z.int().min(1).optional(), requiresFlag: FlagSchema.optional() }).optional(),
  })
  .refine(
    (p) => (p.id.includes('.') ? p.parent !== undefined && p.id.startsWith(`${p.parent}.`) : p.parent === undefined),
    { message: 'a sub-map location ("<place>.<name>") needs its parent; a top-level place has none', path: ['parent'] },
  );

/** i18n file: flat map of key (without "t:") to text. An optional "_meta" marks drafts (7.4). */
export const I18nFileSchema = z.record(z.string(), z.union([z.string(), z.object({ status: z.string() })]));

// ---------------------------------------------------------------------------
// Saved games: GameState (types.ts), so a save or the demo save can be checked on load.
// ---------------------------------------------------------------------------

const Count = z.int().min(0);
const JarAmounts = z.strictObject({ needs: Count, wants: Count, goals: Count, savings: Count });

export const PendingEffectSchema = z.strictObject({
  dueMonth: z.int().min(1),
  dueWeek: z.int().min(1).max(WEEKS_PER_MONTH),
  effects: EffectsSchema,
  note: TKeySchema,
  principal: z.partialRecord(JarIdSchema, Count).optional(),
});

export const GameStateSchema = z.strictObject({
  version: z.literal(1),
  personaId: PersonaIdSchema,
  level: LevelSchema,
  seed: SeedSchema,
  month: z.int().min(1),
  week: z.int().min(1).max(WEEKS_PER_MONTH),
  jars: JarAmounts,
  debt: Count,
  goal: z.strictObject({ amount: Count, progress: Count }),
  flags: z.array(FlagSchema),
  seen: z.array(z.string()),
  pending: z.array(PendingEffectSchema),
  rewindTokens: z.int().min(0).max(REWIND_TOKENS_PER_MONTH),
  history: z.array(z.unknown()),
  // Saves from before earn() existed have no `earned`; they load with an empty list.
  earned: z.array(z.string()).default([]),
  score: z.number().min(0).max(100).optional(),
  stage: z.enum(['event', 'decision', 'monthEnd', 'yearEnd']).optional(),
  monthStart: z
    .strictObject({
      jars: JarAmounts,
      debt: Count,
      income: Count,
      needsBudget: Count,
      paydaySaved: Count.optional(),
      inFlight: Count.optional(),
      baseIncome: Count.optional(),
    })
    .optional(),
  scores: z.array(z.number().min(0).max(100)).optional(),
  lessons: z.array(TKeySchema).optional(),
});
