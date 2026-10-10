import { describe, expect, it } from 'vitest';
import { hashSeed } from '../src';

describe('hashSeed (FNV-1a 32-bit)', () => {
  it('matches the published FNV-1a test vectors', () => {
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(hashSeed('a')).toBe(0xe40c292c);
    expect(hashSeed('foobar')).toBe(0xbf9cf968);
  });

  it('is stable and a uint32', () => {
    const h = hashSeed('anon-123', 'sana');
    expect(h).toBe(hashSeed('anon-123', 'sana'));
    expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
  });

  it('does not confuse ("ab","c") with ("a","bc")', () => {
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'));
  });

  it('differs per persona', () => {
    expect(hashSeed('anon-123', 'sana')).not.toBe(hashSeed('anon-123', 'ravi'));
  });
});
