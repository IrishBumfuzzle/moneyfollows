/**
 * RNG state is a single uint32 so it can live inside the saved game state
 * and be snapshotted by the rewind manager. Every function returns the next
 * state instead of mutating anything.
 */
export type RngState = number;

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/** mulberry32. Returns a float in [0, 1) and the next state. */
export function nextFloat(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Integer in [min, max], both inclusive. */
export function nextInt(state: RngState, min: number, max: number): [number, RngState] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`nextInt needs integers with min <= max, got ${min}..${max}`);
  }
  const [f, next] = nextFloat(state);
  return [min + Math.floor(f * (max - min + 1)), next];
}
