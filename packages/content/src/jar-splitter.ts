// Jar Splitter mini-game rounds (minigames/jar-splitter.json). The student splits one payday
// into the four jars; the engine's scoreJarSplit checks the split against each round's checks.
// Practice only: it never changes the story's GameState.
import { z } from 'zod';
import { JarIdSchema, LevelSchema, PersonaIdSchema, TKeySchema } from '@paisa/shared';

const Rupees = z.int().min(0);
const Percent = z.int().min(1).max(100);
/** Feedback keys may use {{amount}}, {{short}} and {{percent}}; the UI formats rupees with en-IN grouping. */
const feedback = { ok: TKeySchema, fix: TKeySchema };

export const JarCheckSchema = z.discriminatedUnion('kind', [
  /** One jar gets at least `amount` rupees (e.g. Needs covers this month's bills). */
  z.strictObject({
    id: z.string().regex(/^[a-z0-9_]+$/),
    kind: z.literal('min_jar'),
    jar: JarIdSchema,
    amount: Rupees,
    ...feedback,
  }),
  /** These jars together get at least `percent`% of the income. */
  z.strictObject({
    id: z.string().regex(/^[a-z0-9_]+$/),
    kind: z.literal('min_share'),
    jars: z.array(JarIdSchema).min(1),
    percent: Percent,
    ...feedback,
  }),
  /** These jars together get at most `percent`% of the income. */
  z.strictObject({
    id: z.string().regex(/^[a-z0-9_]+$/),
    kind: z.literal('max_share'),
    jars: z.array(JarIdSchema).min(1),
    percent: Percent,
    ...feedback,
  }),
]);

export const JarSplitRoundSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/),
    personas: z.array(PersonaIdSchema).min(1),
    levels: z.array(LevelSchema).min(1),
    text: TKeySchema,
    /** Shown after the round, whatever the split. */
    lesson: TKeySchema,
    /** Rupees to split. */
    income: z.int().min(1),
    /** Slider step in rupees. Must divide the income. */
    step: z.int().min(1),
    checks: z.array(JarCheckSchema).min(1).max(4),
    meta: z.strictObject({ status: z.enum(['draft', 'reviewed']), author: z.string().min(1) }),
  })
  .refine((r) => r.income % r.step === 0, { message: 'step must divide income', path: ['step'] })
  .refine((r) => r.checks.every((c) => c.kind !== 'min_jar' || c.amount <= r.income), {
    message: 'a min_jar amount cannot be more than the income',
    path: ['checks'],
  })
  .refine((r) => new Set(r.checks.map((c) => c.id)).size === r.checks.length, {
    message: 'check ids must be unique within a round',
    path: ['checks'],
  });

export type JarCheck = z.infer<typeof JarCheckSchema>;
export type JarSplitRound = z.infer<typeof JarSplitRoundSchema>;
