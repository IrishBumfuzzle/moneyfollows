import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRINGS, t } from './index';

describe('dashboard shell content', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi).sort()).toEqual(Object.keys(STRINGS.en).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang])) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('keeps the {{vars}} the same in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(STRINGS.en)) expect(vars(STRINGS.hi[k]!), k).toEqual(vars(v));
  });

  it('fills variables', () => {
    expect(t('en', 'signin.resend_wait', { s: 42 })).toBe('Send a new code in 42s');
    expect(t('hi', 'settings.code.changed', { code: 'ABCD 2345' })).toContain('ABCD 2345');
  });

  // Typos in a key would silently show the key itself, so check every key the code mentions.
  it('every key used by the shell, sign-in and class screens exists', () => {
    const root = join(__dirname, '..');
    const files = [
      join(root, 'App.tsx'),
      ...['shell', 'screens/signin', 'screens/classes'].flatMap((d) => walk(join(root, d))),
    ].filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    const used = new Set<string>();
    const re =
      /['"`]((?:app|topbar|setup|loading|staffcheck|notstaff|signin|nav|classes|lang|class|sheet|settings)\.[a-z0-9_.]+)['"`]/g;
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(re)) used.add(m[1]!);
    expect(used.size).toBeGreaterThan(40);
    for (const k of used) expect(STRINGS.en[k], k).toBeTruthy();
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
