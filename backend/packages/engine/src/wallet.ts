import { JARS, type AppliedEffects, type JarBalances, type JarDeltas } from '@paisa/contracts';

export interface WalletResult {
  jars: JarBalances;
  debt: number;
  applied: AppliedEffects;
}

/**
 * Applies signed jar deltas and a debt delta. A jar can't go below zero: the
 * shortfall is borrowed instead. A repayment is capped at the debt owed.
 */
export function applyEffects(jars: JarBalances, debt: number, deltas: JarDeltas, debtDelta = 0): WalletResult {
  const next: JarBalances = { ...jars };
  const applied: JarDeltas = {};
  let borrowed = 0;

  for (const jar of JARS) {
    const d = deltas[jar] ?? 0;
    if (d === 0) continue;
    const balance = jars[jar];
    if (d > 0 || balance + d >= 0) {
      next[jar] = balance + d;
      applied[jar] = d;
    } else {
      borrowed += -d - balance;
      next[jar] = 0;
      if (balance > 0) applied[jar] = -balance;
    }
  }

  const newDebt = Math.max(0, debt + borrowed + debtDelta);
  return { jars: next, debt: newDebt, applied: { deltas: applied, debt: newDebt - debt, borrowed } };
}
