import { describe, expect, it, vi } from 'vitest';
import { track } from '../../api/track';
import { trackAppOpen } from './appOpen';
import { STRINGS } from './content';

vi.mock('../../api/track', () => ({ track: vi.fn() }));

describe('main screen content (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang]!)) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('keeps the visible news label inside the button name (WCAG label in name)', () => {
    for (const lang of ['en', 'hi'] as const) {
      for (const k of ['main.news.open', 'main.news.open_new']) expect(STRINGS[lang]![k]).toContain(STRINGS[lang]!['main.news']);
    }
  });
});

describe('trackAppOpen', () => {
  it('sends app_open once per page load, however often the screen mounts', () => {
    trackAppOpen();
    trackAppOpen();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('app_open');
  });
});
