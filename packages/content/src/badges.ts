// Badge definitions (rewards/badges.json). The engine's rewards module evaluates each rule;
// names and descriptions are t: keys like every other string.
import { z } from 'zod';
import { PillarSchema, TKeySchema } from '@paisa/shared';

const Count = z.int().min(1);

/** What earns a badge. Each kind is checked by the engine (packages/engine/src/rewards.ts). */
export const BadgeRuleSchema = z.discriminatedUnion('kind', [
  /** At least `n` cards played (decisions and events). */
  z.strictObject({ kind: z.literal('decisions'), n: Count }),
  /** At least `n` different cards played from one pillar. */
  z.strictObject({ kind: z.literal('pillar_decisions'), pillar: PillarSchema, n: Count }),
  /** The Savings jar holds at least `percent`% of one month of Needs (default 100). */
  z.strictObject({ kind: z.literal('emergency_fund'), percent: z.int().min(1).max(100).optional() }),
  /** Goal progress has reached the goal amount. */
  z.strictObject({ kind: z.literal('goal_reached') }),
  /** A Money Health Score of at least `n` in some finished month. */
  z.strictObject({ kind: z.literal('month_score'), n: z.int().min(1).max(100) }),
  /** Played in `weeks` real-world weeks in a row (the weekly streak). */
  z.strictObject({ kind: z.literal('streak'), weeks: Count }),
]);

export const BadgeSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: TKeySchema,
  description: TKeySchema,
  icon: z.string().min(1),
  /** XP paid once when the badge is earned. */
  xp: z.int().min(0),
  rule: BadgeRuleSchema,
  meta: z.strictObject({ status: z.enum(['draft', 'reviewed']), author: z.string().min(1) }),
});

export type BadgeRule = z.infer<typeof BadgeRuleSchema>;
export type Badge = z.infer<typeof BadgeSchema>;
