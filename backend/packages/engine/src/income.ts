import type { JarBalances, JarSplit, Persona } from '@paisa/contracts';
import { nextInt, type RngState } from './rng';

/** This month's pay. Irregular income consumes a seeded draw; the other patterns leave the rng alone. */
export function rollIncome(persona: Persona, month: number, rng: RngState): [number, RngState] {
  const model = persona.income;
  switch (model.pattern) {
    case 'steady':
      return [model.amount, rng];
    case 'seasonal':
      return [Math.round(model.amount * (model.multipliers[(month - 1) % 12] ?? 1)), rng];
    case 'irregular': {
      const lo = Math.ceil(model.min / model.step);
      const hi = Math.floor(model.max / model.step);
      if (hi < lo) {
        // No multiple of `step` fits in the range. Keep the draw so rng use stays stable.
        const [, next] = nextInt(rng, 0, 0);
        return [model.min, next];
      }
      const [n, next] = nextInt(rng, lo, hi);
      return [n * model.step, next];
    }
  }
}

/** Whole-rupee split by percentage. Rounding leftovers go to Needs. */
export function splitIncome(income: number, split: JarSplit): JarBalances {
  const wants = Math.floor((income * split.wants) / 100);
  const goals = Math.floor((income * split.goals) / 100);
  const savings = Math.floor((income * split.savings) / 100);
  const needsShare = Math.floor((income * split.needs) / 100);
  return { needs: needsShare + (income - needsShare - wants - goals - savings), wants, goals, savings };
}
