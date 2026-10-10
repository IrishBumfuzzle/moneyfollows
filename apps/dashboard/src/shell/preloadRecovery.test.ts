import { describe, expect, it } from 'vitest';
import { claimReload } from './preloadRecovery';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('claimReload', () => {
  it('allows one reload per session, then refuses', () => {
    const storage = memory();
    expect(claimReload(storage)).toBe(true);
    expect(claimReload(storage)).toBe(false);
  });

  it('never reloads when storage is missing or throws, so it cannot loop', () => {
    expect(claimReload(undefined)).toBe(false);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(claimReload(blocked)).toBe(false);
  });
});
