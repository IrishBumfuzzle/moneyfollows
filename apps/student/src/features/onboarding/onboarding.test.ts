import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatRupees, STRINGS, t } from './content';
import { JOIN_ERRORS } from './joinErrors';
import { isSavedJoin } from './joined';
import { AVATARS, PERSONAS } from './presets';
import {
  CODE_MAX,
  cleanCode,
  cleanRejoinCode,
  formatRejoinCode,
  isValidNickname,
  isValidRejoinCode,
  NICKNAME_MAX,
  nicknameProblem,
} from './validate';

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

  it('has a message for every join error, and every literal key the screen uses exists in en', () => {
    const src = ['Onboarding.tsx', 'joinErrors.ts']
      .map((f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8'))
      .join('\n');
    const used = [...src.matchAll(/'((?:onboarding|persona)\.[\w.]+)'/g)].map((m) => m[1]!);
    for (const { key } of Object.values(JOIN_ERRORS)) used.push(key);
    expect(used.length).toBeGreaterThan(20);
    for (const k of used) expect(STRINGS.en![k], k).toBeTruthy();
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

describe('nickname rules (a client-valid nickname is always server-valid)', () => {
  it('accepts Latin or Devanagari with digits, spaces and . _ -', () => {
    for (const ok of ['Sana', 'Sana2008', 'राहुल', 'राहुल १२', 'Chai Champ', 'Rahul-7', 'a_b', 'Ab', '  Sana  ', 'a'.repeat(NICKNAME_MAX)]) {
      expect(nicknameProblem(ok), ok).toBeNull();
      expect(isValidNickname(ok), ok).toBe(true);
    }
  });

  it('reads full-width look-alikes the way the server does (NFKC)', () => {
    expect(nicknameProblem('Ｓana')).toBeNull();
    expect(nicknameProblem('１２３４５')).toBe('personal_info');
  });

  it('rejects wrong lengths, symbols, emoji, mixed scripts and nicknames that are mostly separators', () => {
    for (const bad of ['', ' ', 'a', 'a'.repeat(NICKNAME_MAX + 1), 'a<b', 'Sana😀', 'Rahul राहुल', '..', '_ -', 'tab\there']) {
      expect(nicknameProblem(bad), JSON.stringify(bad)).toBe('invalid');
    }
  });

  it('calls an @ or 5+ digits (Devanagari digits too) personal info, before anything else', () => {
    for (const bad of ['Ab@c', '98765 43210', '12345', 'Sana12345', '१२३४५', 'a'.repeat(30) + '12345']) {
      expect(nicknameProblem(bad), bad).toBe('personal_info');
    }
    expect(nicknameProblem('Sana1234')).toBeNull(); // 4 digits is fine
  });
});

describe('rejoin code', () => {
  it('uppercases and drops spaces and anything outside the server alphabet', () => {
    expect(cleanRejoinCode(' abc 234 ')).toBe('ABC234');
    expect(cleanRejoinCode('AB0O1IL')).toBe('AB'); // 0, O, 1, I, L are never in a code
  });

  it('keeps 6 characters and needs all 6', () => {
    expect(cleanRejoinCode('ABCDEFGH')).toBe('ABCDEF');
    expect(isValidRejoinCode('abc 234')).toBe(true);
    expect(isValidRejoinCode('ABC23')).toBe(false);
    expect(isValidRejoinCode('')).toBe(false);
  });

  it('shows 3 + 3', () => {
    expect(formatRejoinCode('ABC234')).toBe('ABC 234');
  });
});

describe('isSavedJoin (what is read back from IndexedDB)', () => {
  const saved = {
    code: 'HYD234',
    nickname: 'Sana',
    result: { anon_id: 'a', class_id: 'c', default_lang: 'hi', endline_open: false, rejoin_code: 'ABC234' },
    lang: 'hi',
    avatar: 'tiger',
  };

  it('accepts a saved join, with or without an avatar, a rejoin flag or a rejoin code', () => {
    expect(isSavedJoin(saved)).toBe(true);
    expect(isSavedJoin({ ...saved, avatar: null, rejoin: true })).toBe(true);
    expect(isSavedJoin({ ...saved, result: { ...saved.result, rejoin_code: null } })).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of [undefined, null, 'x', {}, { ...saved, lang: 'fr' }, { ...saved, avatar: 'dragon' }, { ...saved, result: null }, { ...saved, result: { ...saved.result, anon_id: '' } }]) {
      expect(isSavedJoin(bad)).toBe(false);
    }
  });
});
