// Pure 32-bit hashing. GameState carries no RNG cursor, so every random choice is
// derived from (seed, purpose, month, week, ...) and replays identically after a rewind.

/** FNV-1a over the seed and parts, then a murmur3-style finaliser. Returns a uint32. */
export function hash(seed: number, ...parts: (string | number)[]): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  h = Math.imul(h, 16777619) >>> 0;
  for (const part of parts) {
    const text = `${part}|`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A float in [0, 1). */
export function unit(seed: number, ...parts: (string | number)[]): number {
  return hash(seed, ...parts) / 4294967296;
}

/** Picks one item with probability proportional to its weight. `u` is in [0, 1). */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, u: number): T | undefined {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let target = u * total;
  for (const item of items) {
    target -= weight(item);
    if (target < 0) return item;
  }
  return items[items.length - 1];
}
