import { describe, expect, it } from 'vitest';
import { STRINGS } from './content';

describe('home strings (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang]!)) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('keeps the same {{vars}} in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(STRINGS.en!)) expect(vars(STRINGS.hi![k]!), k).toEqual(vars(v));
  });
});
