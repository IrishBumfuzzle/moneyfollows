import { describe, expect, it } from 'vitest';
import { STRINGS } from './content';
import { isDraftLang, languageChoices, urlForLang } from './lang';
import { applyDataSaver } from './useSettings';

describe('settings content (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang]!)) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('has a label for every language the picker can show', () => {
    for (const l of languageChoices(true)) expect(STRINGS.en![`settings.lang.${l}`]).toBeTruthy();
  });
});

describe('language picker', () => {
  it('shows Telugu only with draft languages on, marked as a draft', () => {
    expect(languageChoices(false)).toEqual(['en', 'hi']);
    expect(languageChoices(true)).toEqual(['en', 'hi', 'te']);
    expect(isDraftLang('te')).toBe(true);
    expect(isDraftLang('hi')).toBe(false);
  });

  it('rewrites ?lang= (which overrides the profile) and leaves other addresses alone', () => {
    expect(urlForLang('https://x.app/?demo=1&lang=hi', 'en')).toBe('/?demo=1&lang=en');
    expect(urlForLang('https://x.app/?demo=1', 'hi')).toBeNull();
  });
});

describe('data saver', () => {
  it('toggles the data-saver attribute on the root element', () => {
    const attrs = new Set<string>();
    const root = { toggleAttribute: (a: string, on?: boolean) => (on ? attrs.add(a) : attrs.delete(a), !!on) };
    applyDataSaver(true, root);
    expect(attrs.has('data-saver')).toBe(true);
    applyDataSaver(false, root);
    expect(attrs.has('data-saver')).toBe(false);
  });
});
