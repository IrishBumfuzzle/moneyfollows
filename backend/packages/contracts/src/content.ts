import { z } from 'zod';

export const PILLARS = ['plan_budget', 'save_manage', 'understand_investing', 'stay_safe'] as const;
export const Pillar = z.enum(PILLARS);
export type Pillar = z.infer<typeof Pillar>;

export const JARS = ['needs', 'wants', 'goals', 'savings'] as const;
export const JarId = z.enum(JARS);
export type JarId = z.infer<typeof JarId>;

export const PERSONAS = ['ravi', 'sana', 'kiran', 'lakshmi'] as const;
export const PersonaId = z.enum(PERSONAS);
export type PersonaId = z.infer<typeof PersonaId>;

export const LANGUAGES = ['te', 'ur', 'hi', 'en'] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;

/** Maturity level: 1 Starter, 2 Explorer, 3 Planner. */
export const Difficulty = z.int().min(1).max(3);

/** Dotted lowercase ID, e.g. "budget.recharge.01". */
export const ContentId = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);

/** Translation key. String files store the key without the "t:" prefix. */
export const TKey = z.string().regex(/^t:[a-z0-9_]+(\.[a-z0-9_]+)*$/);
export type TKey = z.infer<typeof TKey>;

/** In-game rupees, whole numbers only. Negative means money leaves the jar. */
export const Rupees = z.int();

/** Story flag set by a choice and checked by `requiresFlag`. */
export const Flag = z.string().regex(/^[a-z0-9_]+$/);

const jarDeltas = {
  needs: Rupees.optional(),
  wants: Rupees.optional(),
  goals: Rupees.optional(),
  savings: Rupees.optional(),
};

/** A consequence the effects resolver applies some weeks after the choice. */
export const DelayedEffect = z.strictObject({
  afterWeeks: z.int().min(1).max(52),
  ...jarDeltas,
  /** Positive borrows (debt goes up), negative repays. (v0.2) */
  debt: Rupees.optional(),
  text: TKey,
});
export type DelayedEffect = z.infer<typeof DelayedEffect>;

export const Effects = z.strictObject({
  ...jarDeltas,
  /** Positive borrows (debt goes up), negative repays. Pair a repayment with a jar spend. (v0.2) */
  debt: Rupees.optional(),
  /** Story flags to set. (v0.2) */
  flags: z.array(Flag).optional(),
  delayed: z.array(DelayedEffect).optional(),
});
export type Effects = z.infer<typeof Effects>;

/**
 * How a choice reads against the lesson. The selector serves more cards on
 * concepts where the player picked `risky`, and badges count `best` picks.
 * Never shown to the student as right or wrong. (v0.2)
 */
export const ChoiceRating = z.enum(['best', 'ok', 'risky']);
export type ChoiceRating = z.infer<typeof ChoiceRating>;

export const Choice = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]{1,16}$/),
  label: TKey,
  /** Icon name from the app's icon set. (v0.2) */
  icon: z.string().regex(/^[a-z0-9_]+$/).optional(),
  effects: Effects,
  lesson: TKey,
  rating: ChoiceRating.optional(),
});
export type Choice = z.infer<typeof Choice>;

const uniqueChoiceIds = <T extends { choices: { id: string }[] }>(s: T) =>
  new Set(s.choices.map((c) => c.id)).size === s.choices.length;
const uniqueChoiceIdsIssue = { message: 'choice ids must be unique within a scenario', path: ['choices'] };

const RegionList = z.array(z.string().regex(/^[a-z0-9_]+$/));

export const Scenario = z
  .strictObject({
    id: ContentId,
    pillar: Pillar,
    concept: z.string().regex(/^[a-z0-9_]+$/),
    personas: z.array(PersonaId).min(1),
    difficulty: Difficulty,
    /** Region pack IDs, e.g. "hyderabad". Omitted means every region. */
    regions: RegionList.optional(),
    illustration: z.string().optional(),
    text: TKey,
    /** Only served after a choice set this flag. (v0.2) */
    requiresFlag: Flag.optional(),
    /** True when the card shows assumed numbers; the client must render AssumptionBanner. (v0.2) */
    assumption: z.boolean().optional(),
    choices: z.array(Choice).min(2).max(4),
  })
  .refine(uniqueChoiceIds, uniqueChoiceIdsIssue);
export type Scenario = z.infer<typeof Scenario>;

/** A surprise life event. Drawn from a weighted deck; a single choice is an "OK" card. (v0.2) */
export const EventCard = z
  .strictObject({
    id: ContentId,
    pillar: Pillar,
    personas: z.array(PersonaId).min(1),
    /** Maturity levels that can draw this event. */
    levels: z.array(Difficulty).min(1),
    /** Relative draw weight, higher is more common. */
    weight: z.number().positive().max(100),
    regions: RegionList.optional(),
    illustration: z.string().optional(),
    text: TKey,
    choices: z.array(Choice).min(1).max(4),
  })
  .refine(uniqueChoiceIds, uniqueChoiceIdsIssue);
export type EventCard = z.infer<typeof EventCard>;

/** Jar split as whole percentages that add up to 100. (v0.2) */
export const JarSplit = z
  .strictObject({ needs: z.int().min(0).max(100), wants: z.int().min(0).max(100), goals: z.int().min(0).max(100), savings: z.int().min(0).max(100) })
  .refine((s) => s.needs + s.wants + s.goals + s.savings === 100, { message: 'jar split must add up to 100' });
export type JarSplit = z.infer<typeof JarSplit>;

export const JarBalances = z.strictObject({
  needs: Rupees.min(0),
  wants: Rupees.min(0),
  goals: Rupees.min(0),
  savings: Rupees.min(0),
});
export type JarBalances = z.infer<typeof JarBalances>;

export const IncomeModel = z.discriminatedUnion('pattern', [
  z.strictObject({ pattern: z.literal('steady'), amount: Rupees.positive() }),
  /** `multipliers[m]` scales the base amount in month m+1 (festival rush, exam months). */
  z.strictObject({
    pattern: z.literal('seasonal'),
    amount: Rupees.positive(),
    multipliers: z.array(z.number().min(0).max(5)).length(12),
  }),
  /** A seeded draw between min and max, rounded to `step`. */
  z.strictObject({
    pattern: z.literal('irregular'),
    min: Rupees.positive(),
    max: Rupees.positive(),
    step: Rupees.positive().default(50),
  }),
]);
export type IncomeModel = z.infer<typeof IncomeModel>;

/** Persona tuning: every number the engine uses for a character. (v0.2) */
export const Persona = z.strictObject({
  id: PersonaId,
  name: TKey,
  bio: TKey,
  income: IncomeModel,
  /** Fixed monthly costs taken from Needs on payday (bus pass, family contribution). */
  fixedCosts: Rupees.min(0),
  startingJars: JarBalances,
  /** Default payday split; the player can change it at month end. */
  split: JarSplit,
  goal: z.strictObject({ label: TKey, amount: Rupees.positive() }),
});
export type Persona = z.infer<typeof Persona>;

/** A month-end reflection question, answered by tapping one option. (v0.2) */
export const Reflection = z.strictObject({
  id: ContentId,
  /** Asked when this pillar had the most risky picks in the month. Omitted means general. */
  pillar: Pillar.optional(),
  question: TKey,
  options: z.array(TKey).min(2).max(4),
});
export type Reflection = z.infer<typeof Reflection>;

export const QUIZ_KINDS = ['baseline', 'module', 'endline', 'retention'] as const;
export const QuizKind = z.enum(QUIZ_KINDS);
export type QuizKind = z.infer<typeof QuizKind>;

/** One quiz question. Form A feeds the baseline, form B the parallel end-line. (v0.2) */
export const QuizQuestion = z
  .strictObject({
    id: ContentId,
    pillar: Pillar,
    concept: z.string().regex(/^[a-z0-9_]+$/),
    difficulty: Difficulty,
    form: z.enum(['A', 'B']),
    text: TKey,
    options: z.array(TKey).min(2).max(4),
    /** Index into `options`. */
    answer: z.int().min(0),
    explanation: TKey,
  })
  .refine((q) => q.answer < q.options.length, { message: 'answer must index an option', path: ['answer'] });
export type QuizQuestion = z.infer<typeof QuizQuestion>;

/** One piece of a scam message; suspicious parts carry the reason shown in the Message Inspector. */
export const MessageSegment = z.strictObject({
  text: TKey,
  suspicious: TKey.optional(),
});
export type MessageSegment = z.infer<typeof MessageSegment>;

/** A card for Scam or Safe? and the Message Inspector. (v0.2) */
export const ScamMessage = z.strictObject({
  id: ContentId,
  channel: z.enum(['sms', 'whatsapp', 'call', 'qr']),
  levels: z.array(Difficulty).min(1),
  sender: TKey,
  segments: z.array(MessageSegment).min(1),
  verdict: z.enum(['scam', 'safe']),
  explanation: TKey,
});
export type ScamMessage = z.infer<typeof ScamMessage>;

/** Global numbers for the simulation, scoring and projections. (v0.2) */
export const Tuning = z.strictObject({
  months: z.int().min(1).max(24),
  weeksPerMonth: z.int().min(1).max(6),
  rewindTokensPerMonth: z.int().min(0).max(10),
  /** Chance of a surprise event in a week, per maturity level ("1", "2", "3"). */
  eventChance: z.strictObject({ '1': z.number().min(0).max(1), '2': z.number().min(0).max(1), '3': z.number().min(0).max(1) }),
  score: z.strictObject({
    /** Savings rate that earns full marks, e.g. 0.2 for 20% of income. */
    savingsTarget: z.number().positive().max(1),
    weights: z.strictObject({
      savingsRate: z.number().min(0),
      emergencyFund: z.number().min(0),
      goalProgress: z.number().min(0),
      debt: z.number().min(0),
    }),
  }),
  xp: z.strictObject({
    decision: z.int().min(0),
    bestChoice: z.int().min(0),
    reflection: z.int().min(0),
    monthComplete: z.int().min(0),
  }),
  /** Assumed yearly rates for the Time Machine. Placeholders until compliance confirms them. */
  projection: z.strictObject({
    bad: z.number().min(0).max(0.5),
    average: z.number().min(0).max(0.5),
    good: z.number().min(0).max(0.5),
  }),
});
export type Tuning = z.infer<typeof Tuning>;

/** String file for one language: key (without "t:") to text. */
export const StringTable = z.record(z.string(), z.string());
export type StringTable = z.infer<typeof StringTable>;

/** Everything the engine needs. Both a `ContentSource` and a built `ContentPack` satisfy it. (v0.2) */
export const GameContent = z.object({
  scenarios: z.array(Scenario),
  events: z.array(EventCard),
  personas: z.array(Persona),
  reflections: z.array(Reflection),
  quizQuestions: z.array(QuizQuestion),
  tuning: Tuning,
});
export type GameContent = z.infer<typeof GameContent>;

/**
 * Everything the pack builder needs, however it was loaded (fixtures on disk or the database).
 * The v0.2 fields default to empty so v0.1 sources still parse.
 */
export const ContentSource = z.object({
  scenarios: z.array(Scenario),
  events: z.array(EventCard).default([]),
  personas: z.array(Persona).default([]),
  reflections: z.array(Reflection).default([]),
  quizQuestions: z.array(QuizQuestion).default([]),
  scamMessages: z.array(ScamMessage).default([]),
  tuning: Tuning.optional(),
  strings: z.partialRecord(Language, StringTable),
});
export type ContentSource = z.infer<typeof ContentSource>;
export type ContentSourceInput = z.input<typeof ContentSource>;

/** One built pack for a region and language: what phones cache and the Game API loads. (v0.2) */
export const ContentPack = GameContent.extend({
  manifest: z.strictObject({
    region: z.string(),
    language: Language,
    version: z.string(),
  }),
  scamMessages: z.array(ScamMessage),
  strings: StringTable,
});
export type ContentPack = z.infer<typeof ContentPack>;

export const PackManifestEntry = z.strictObject({
  id: z.string(),
  region: z.string(),
  language: Language,
  version: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  url: z.string(),
});
export type PackManifestEntry = z.infer<typeof PackManifestEntry>;

export const PackManifest = z.strictObject({
  region: z.string(),
  packs: z.array(PackManifestEntry),
});
export type PackManifest = z.infer<typeof PackManifest>;
