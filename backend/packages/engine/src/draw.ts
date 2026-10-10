import { nextFloat, type RngState } from './rng';

/** Weighted pick that always consumes exactly one float, so rng use stays stable. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: RngState): [T, RngState] {
  const [f, next] = nextFloat(rng);
  const total = weights.reduce((a, b) => a + b, 0);
  let target = f * total;
  for (let i = 0; i < items.length; i++) {
    target -= weights[i] ?? 0;
    if (target < 0) return [items[i] as T, next];
  }
  return [items[items.length - 1] as T, next];
}
