// Seeded helpers for the store's mini-games: no Math.random, so the same seed always deals the
// same game and a round can be replayed and tested.

/** 32-bit integer hash (mulberry32 step) of the inputs: same inputs, same number. */
export function hash(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ x, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** A deterministic shuffle (Fisher–Yates driven by hash); never mutates its input. */
export function shuffle<T>(xs: readonly T[], seed: number, salt: number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = hash(seed, salt, i) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
