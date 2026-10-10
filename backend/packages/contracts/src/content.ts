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
  text: TKey,
});
export type DelayedEffect = z.infer<typeof DelayedEffect>;

export const Effects = z.strictObject({
  ...jarDeltas,
  delayed: z.array(DelayedEffect).optional(),
});
export type Effects = z.infer<typeof Effects>;

export const Choice = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]{1,16}$/),
  label: TKey,
  effects: Effects,
  lesson: TKey,
});
export type Choice = z.infer<typeof Choice>;

export const Scenario = z
  .strictObject({
    id: ContentId,
    pillar: Pillar,
    concept: z.string().regex(/^[a-z0-9_]+$/),
    personas: z.array(PersonaId).min(1),
    difficulty: Difficulty,
    /** Region pack IDs, e.g. "hyderabad". Omitted means every region. */
    regions: z.array(z.string().regex(/^[a-z0-9_]+$/)).optional(),
    illustration: z.string().optional(),
    text: TKey,
    choices: z.array(Choice).min(2).max(4),
  })
  .refine((s) => new Set(s.choices.map((c) => c.id)).size === s.choices.length, {
    message: 'choice ids must be unique within a scenario',
    path: ['choices'],
  });
export type Scenario = z.infer<typeof Scenario>;

/** String file for one language: key (without "t:") to text. */
export const StringTable = z.record(z.string(), z.string());
export type StringTable = z.infer<typeof StringTable>;

/** Everything the pack builder needs, however it was loaded (fixtures on disk or the database). */
export const ContentSource = z.object({
  scenarios: z.array(Scenario),
  strings: z.partialRecord(Language, StringTable),
});
export type ContentSource = z.infer<typeof ContentSource>;
