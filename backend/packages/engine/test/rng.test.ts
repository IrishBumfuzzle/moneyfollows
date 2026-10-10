import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, seedRng, type RngState } from '../src';

function draw(seed: number, n: number): number[] {
  let s: RngState = seedRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [v, next] = nextFloat(s);
    out.push(v);
    s = next;
  }
  return out;
}

describe('seeded rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw(42, 100)).toEqual(draw(42, 100));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(42, 10)).not.toEqual(draw(43, 10));
  });

  it('stays in [0, 1)', () => {
    for (const v of draw(7, 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes from a snapshotted state', () => {
    const [, s1] = nextFloat(seedRng(99));
    const [a] = nextFloat(s1);
    const [b] = nextFloat(s1);
    expect(a).toBe(b);
  });

  it('keeps nextInt within inclusive bounds', () => {
    let s = seedRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) {
      const [v, next] = nextInt(s, 1, 6);
      seen.add(v);
      s = next;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
