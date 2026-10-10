import { describe, expect, it } from 'vitest';
import { JoinError, joinClass } from '../../api/joinClass';
import { formatRupees, STRINGS, t } from './content';
import { AVATARS, PERSONAS } from './presets';
import { CODE_MAX, cleanCode, isValidNickname } from './validate';

describe('onboarding content (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang]!)) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('has strings for every avatar and persona', () => {
    const keys = [
      ...AVATARS.map((a) => `onboarding.avatar.${a.id}`),
      ...PERSONAS.flatMap((p) => ['name', 'story', 'income', 'goal'].map((f) => `persona.${p.id}.${f}`)),
    ];
    for (const k of keys) expect(STRINGS.en![k], k).toBeTruthy();
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatRupees(100000)).toBe('₹1,00,000');
    expect(t('hi', 'persona.ravi.goal', { amount: formatRupees(25000) })).toContain('₹25,000');
  });
});

describe('cleanCode', () => {
  it('uppercases and drops anything but letters and digits', () => {
    expect(cleanCode(' ab-12 cd ')).toBe('AB12CD');
  });

  it(`keeps at most ${CODE_MAX} characters`, () => {
    expect(cleanCode('A'.repeat(30))).toHaveLength(CODE_MAX);
  });
});

describe('isValidNickname', () => {
  it('accepts letters and digits, including Hindi with matras', () => {
    expect(isValidNickname('Sana2008')).toBe(true);
    expect(isValidNickname('राहुल')).toBe(true);
  });

  it('rejects empty, spaces, symbols and more than 16 characters', () => {
    expect(isValidNickname('')).toBe(false);
    expect(isValidNickname('two words')).toBe(false);
    expect(isValidNickname('a<b')).toBe(false);
    expect(isValidNickname('a'.repeat(17))).toBe(false);
  });
});

describe('joinClass stand-in', () => {
  it('any non-empty code joins and returns ids', async () => {
    const r = await joinClass('AB12CD', 'Sana2008');
    expect(r.anon_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.class_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('an empty code fails with a JoinError the UI can explain', async () => {
    const err = await joinClass('', 'Sana2008').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JoinError);
    expect((err as JoinError).code).toBe('class_not_found');
  });
});
