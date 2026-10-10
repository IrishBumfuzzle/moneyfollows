import { JARS } from '@paisa/shared';
import type { AppliedEffects, Effects, JarId } from '@paisa/shared';

export type Jars = Record<JarId, number>;

export interface WalletResult {
  jars: Jars;
  debt: number;
  applied: AppliedEffects;
}

/**
 * Applies signed jar deltas and a debt delta without mutating anything. A jar never goes
 * below zero: the shortfall is borrowed (added to debt). Debt never goes below zero: a
 * repayment larger than the debt is capped, and the jar spend still happens.
 */
export function applyToWallet(jars: Jars, debt: number, effects: Effects): WalletResult {
  const next: Jars = { ...jars };
  const applied: Partial<Record<JarId, number>> = {};
  let borrowed = 0;

  for (const jar of JARS) {
    const delta = effects.jars?.[jar] ?? 0;
    if (delta === 0) continue;
    const balance = jars[jar];
    if (balance + delta >= 0) {
      next[jar] = balance + delta;
      applied[jar] = delta;
    } else {
      borrowed += -delta - balance;
      next[jar] = 0;
      if (balance > 0) applied[jar] = -balance;
    }
  }

  const newDebt = Math.max(0, debt + borrowed + (effects.debt ?? 0));
  return { jars: next, debt: newDebt, applied: { jars: applied, debt: newDebt - debt, borrowed } };
}
