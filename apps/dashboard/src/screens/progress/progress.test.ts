import { describe, expect, it } from 'vitest';
import type { ClassProgressRow } from '@paisa/shared';
import { STRINGS, t } from './content';
import {
  COLUMNS,
  DEFAULT_SORT,
  GAME_WEEKS,
  filterRows,
  firstDir,
  isInactive,
  loadErrorKey,
  nextSort,
  personaKey,
  sortRows,
  summarize,
} from './progress';

const NOW = new Date('2026-10-11T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function row(nickname: string, over: Partial<ClassProgressRow> = {}): ClassProgressRow {
  return {
    anon_id: `id-${nickname}`,
    nickname,
    modules_done: 0,
    last_active: daysAgo(1),
    lang: 'en',
    decisions: 0,
    pillars: { plan_budget: 0, save_manage: 0, understand_investing: 0, stay_safe: 0 },
    baseline_score: null,
    endline_score: null,
    weeks_played: 0,
    news_editions: 0,
    persona: null,
    classroom_best: null,
    ...over,
  };
}

const names = (rows: ClassProgressRow[]) => rows.map((r) => r.nickname);

describe('isInactive', () => {
  it('flags never-active students', () => {
    expect(isInactive(null, NOW)).toBe(true);
    expect(isInactive(undefined, NOW)).toBe(true);
    expect(isInactive('not a date', NOW)).toBe(true);
  });

  it('flags 7 days or more, not 6', () => {
    expect(isInactive(daysAgo(6), NOW)).toBe(false);
    expect(isInactive(daysAgo(7), NOW)).toBe(true);
    expect(isInactive(daysAgo(11), NOW)).toBe(true);
  });

  it('does not flag someone active today or slightly in the future (clock skew)', () => {
    expect(isInactive(daysAgo(0), NOW)).toBe(false);
    expect(isInactive(daysAgo(-1), NOW)).toBe(false);
  });
});

describe('summarize', () => {
  it('counts students, inactive ones and end-line takers', () => {
    const rows = [
      row('A', { last_active: daysAgo(9), endline_score: 50 }),
      row('B', { last_active: null }),
      row('C', { last_active: daysAgo(2), endline_score: 0 }),
      row('D'),
    ];
    expect(summarize(rows, NOW)).toEqual({ total: 4, inactive: 2, endline: 2 });
  });

  it('is all zero for an empty class', () => {
    expect(summarize([], NOW)).toEqual({ total: 0, inactive: 0, endline: 0 });
  });
});

describe('sortRows', () => {
  const rows = [
    row('Kite10', { decisions: 5, last_active: daysAgo(3) }),
    row('kite2', { decisions: 9, last_active: daysAgo(10) }),
    row('Bee', { decisions: 5, last_active: null, classroom_best: 80 }),
    row('Ant', { decisions: 1, last_active: daysAgo(1), classroom_best: 0 }),
  ];

  it('sorts nicknames numeric-aware and case-insensitive', () => {
    expect(names(sortRows(rows, { key: 'nickname', dir: 'asc' }))).toEqual(['Ant', 'Bee', 'kite2', 'Kite10']);
    expect(names(sortRows(rows, { key: 'nickname', dir: 'desc' }))).toEqual(['Kite10', 'kite2', 'Bee', 'Ant']);
  });

  it('sorts numbers and breaks ties by nickname', () => {
    expect(names(sortRows(rows, { key: 'decisions', dir: 'desc' }))).toEqual(['kite2', 'Bee', 'Kite10', 'Ant']);
    expect(names(sortRows(rows, { key: 'decisions', dir: 'asc' }))).toEqual(['Ant', 'Bee', 'Kite10', 'kite2']);
  });

  it('puts missing values last in both directions, and treats 0 as a value', () => {
    expect(names(sortRows(rows, { key: 'classroom_best', dir: 'asc' }))).toEqual(['Ant', 'Bee', 'kite2', 'Kite10']);
    expect(names(sortRows(rows, { key: 'classroom_best', dir: 'desc' }))).toEqual(['Bee', 'Ant', 'kite2', 'Kite10']);
  });

  it('sorts last active by time, never-active last', () => {
    expect(names(sortRows(rows, { key: 'last_active', dir: 'asc' }))).toEqual(['kite2', 'Kite10', 'Ant', 'Bee']);
    expect(names(sortRows(rows, { key: 'last_active', dir: 'desc' }))).toEqual(['Ant', 'Kite10', 'kite2', 'Bee']);
  });

  it('sorts text columns with a missing persona last', () => {
    const r = [row('A', { persona: 'sana' }), row('B'), row('C', { persona: 'ravi' })];
    expect(names(sortRows(r, { key: 'persona', dir: 'asc' }))).toEqual(['C', 'A', 'B']);
    expect(names(sortRows(r, { key: 'persona', dir: 'desc' }))).toEqual(['A', 'C', 'B']);
  });

  it('does not change its input', () => {
    const input = [row('B'), row('A')];
    const copy = [...input];
    const out = sortRows(input, DEFAULT_SORT);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });

  it('gives every column a sort that does not throw', () => {
    for (const key of COLUMNS) {
      expect(sortRows(rows, { key, dir: 'asc' })).toHaveLength(rows.length);
    }
  });
});

describe('nextSort', () => {
  it('flips the sorted column and starts a new one in its first direction', () => {
    expect(nextSort({ key: 'nickname', dir: 'asc' }, 'nickname')).toEqual({ key: 'nickname', dir: 'desc' });
    expect(nextSort({ key: 'nickname', dir: 'desc' }, 'nickname')).toEqual({ key: 'nickname', dir: 'asc' });
    expect(nextSort(DEFAULT_SORT, 'decisions')).toEqual({ key: 'decisions', dir: 'desc' });
    expect(nextSort(DEFAULT_SORT, 'last_active')).toEqual({ key: 'last_active', dir: 'asc' });
    expect(firstDir('lang')).toBe('asc');
  });
});

describe('filterRows', () => {
  const rows = [row('Silver Coin'), row('Bright Spark'), row('coin2')];

  it('matches part of a nickname, ignoring case and surrounding spaces', () => {
    expect(names(filterRows(rows, ' COIN '))).toEqual(['Silver Coin', 'coin2']);
  });

  it('returns everything for an empty query, and nothing for no match', () => {
    expect(filterRows(rows, '')).toHaveLength(3);
    expect(filterRows(rows, '   ')).toHaveLength(3);
    expect(filterRows(rows, 'zzz')).toEqual([]);
  });

  it('returns a copy, not the input array', () => {
    expect(filterRows(rows, '')).not.toBe(rows);
  });
});

describe('personaKey and loadErrorKey', () => {
  it('translates only the personas that ship', () => {
    expect(personaKey('sana')).toBe('persona.sana');
    expect(personaKey('ravi')).toBe('persona.ravi');
    expect(personaKey('kiran')).toBeNull();
    expect(personaKey(null)).toBeNull();
  });

  it('maps failures to friendly message keys that exist', () => {
    expect(loadErrorKey({ code: 'network' })).toBe('error.network');
    expect(loadErrorKey({ code: 'timeout' })).toBe('error.network');
    expect(loadErrorKey({ code: 'not_signed_in' })).toBe('error.signin');
    expect(loadErrorKey({ code: 'unknown', status: 401 })).toBe('error.signin');
    expect(loadErrorKey(new Error('boom'))).toBe('error.other');
    expect(loadErrorKey(null)).toBe('error.other');
    for (const key of ['error.network', 'error.signin', 'error.other']) {
      expect(STRINGS.en).toHaveProperty([key]);
    }
  });
});

describe('content', () => {
  const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

  it('has the same keys in en and hi, with the same {{placeholders}}', () => {
    expect(Object.keys(STRINGS.hi).sort()).toEqual(Object.keys(STRINGS.en).sort());
    for (const key of Object.keys(STRINGS.en)) {
      expect(vars(STRINGS.hi[key]), key).toEqual(vars(STRINGS.en[key]));
      expect(STRINGS.hi[key].trim(), key).not.toBe('');
    }
  });

  it('has a header for every column, plus the persona and language names the table shows', () => {
    for (const key of COLUMNS) expect(STRINGS.en).toHaveProperty([`col.${key}`]);
    for (const key of ['persona.sana', 'persona.ravi', 'lang.en', 'lang.hi']) expect(STRINGS.en).toHaveProperty([key]);
  });

  it('puts the game length in the weeks header', () => {
    expect(GAME_WEEKS).toBe(12);
    expect(STRINGS.en['col.weeks_played']).toContain(String(GAME_WEEKS));
    expect(STRINGS.hi['col.weeks_played']).toContain(String(GAME_WEEKS));
  });

  it('fills variables and falls back to English, then the key', () => {
    expect(t('en', 'summary.students.other', { n: 24 })).toBe('24 students');
    expect(t('hi', 'summary.students.other', { n: 24 })).toBe('24 छात्र');
    expect(t('hi', 'no.such.key')).toBe('no.such.key');
  });
});
