import { JARS } from '@paisa/shared';
import type { AppliedEffects, Effects, JarId } from '@paisa/shared';

export type Jars = Record<JarId, number>;

export interface WalletResult {
  jars: Jars;
  debt: number;
  applied: AppliedEffects;
}

/**
 * Applies signed jar deltas and a debt delta without mutating anything.
 *
 * - A jar never goes below zero: the shortfall is borrowed (added to debt).
 * - A repayment (`debt` < 0) is capped at the debt owed before the effect. The jar charge
 *   that paid for the capped-off part is not taken either: the jar spends are cut by the
 *   unpaid excess (in JARS order), but never below the amount actually repaid. So repaying
 *   ₹500 of a ₹100 debt from Needs costs ₹100, not ₹500.
 */
export function applyToWallet(jars: Jars, debt: number, effects: Effects): WalletResult {
  const deltas: Partial<Record<JarId, number>> = { ...effects.jars };
  let debtDelta = effects.debt ?? 0;

  if (debtDelta < 0) {
    const repay = Math.min(-debtDelta, Math.max(0, debt));
    const excess = -debtDelta - repay;
    const spend = JARS.reduce((sum, jar) => sum + Math.max(0, -(deltas[jar] ?? 0)), 0);
    let refund = Math.min(excess, Math.max(0, spend - repay));
    for (const jar of JARS) {
      const delta = deltas[jar] ?? 0;
      if (refund === 0) break;
      if (delta >= 0) continue;
      const back = Math.min(refund, -delta);
      deltas[jar] = delta + back;
      refund -= back;
    }
    debtDelta = -repay;
  }

  const next: Jars = { ...jars };
  const applied: Partial<Record<JarId, number>> = {};
  let borrowed = 0;

  for (const jar of JARS) {
    const delta = deltas[jar] ?? 0;
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

  const newDebt = Math.max(0, debt + borrowed + debtDelta);
  return { jars: next, debt: newDebt, applied: { jars: applied, debt: newDebt - debt, borrowed } };
}
