import { describe, expect, it } from 'vitest';
import type { ClassRow } from '@paisa/api-client';
import { NAME_MAX, formatCode, mergeClass, patchClassRow, validateClassName } from './classes';

const row = (id: string, created_at: string, over: Partial<ClassRow> = {}): ClassRow => ({
  id,
  class_code: 'ABCD2345',
  default_lang: 'en',
  facilitator_id: 'f',
  name: id,
  created_at,
  join_open: true,
  endline_open: false,
  ...over,
});

describe('validateClassName', () => {
  it('needs 1 to 80 characters after trimming', () => {
    expect(validateClassName('')).toBe('empty');
    expect(validateClassName('   ')).toBe('empty');
    expect(validateClassName('Class 11 A')).toBeNull();
    expect(validateClassName('a'.repeat(NAME_MAX))).toBeNull();
    expect(validateClassName('a'.repeat(NAME_MAX + 1))).toBe('long');
  });

  it('counts Hindi letters as characters, not bytes', () => {
    expect(validateClassName('क'.repeat(NAME_MAX))).toBeNull();
  });
});

describe('formatCode', () => {
  it('groups the usual 8-character code in fours', () => {
    expect(formatCode('ABCD2345')).toBe('ABCD 2345');
  });

  it('leaves other lengths, like the demo code, alone', () => {
    expect(formatCode('HYD234')).toBe('HYD234');
  });
});

describe('mergeClass', () => {
  it('puts a new class first when it is the newest', () => {
    const list = [row('b', '2026-10-02T00:00:00Z'), row('a', '2026-10-01T00:00:00Z')];
    expect(mergeClass(list, row('c', '2026-10-03T00:00:00Z')).map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });

  it('replaces a changed class in place and keeps the order', () => {
    const list = [row('b', '2026-10-02T00:00:00Z'), row('a', '2026-10-01T00:00:00Z')];
    const next = mergeClass(list, row('a', '2026-10-01T00:00:00Z', { join_open: false }));
    expect(next.map((c) => c.id)).toEqual(['b', 'a']);
    expect(next[1]!.join_open).toBe(false);
  });

  it('does not change the list it was given', () => {
    const list = [row('a', '2026-10-01T00:00:00Z')];
    mergeClass(list, row('b', '2026-10-02T00:00:00Z'));
    expect(list).toHaveLength(1);
  });

  it('works from an empty list', () => {
    expect(mergeClass([], row('a', '2026-10-01T00:00:00Z'))).toHaveLength(1);
  });
});

describe('patchClassRow', () => {
  const list = () => [row('b', '2026-10-02T00:00:00Z'), row('a', '2026-10-01T00:00:00Z')];

  it('changes only the patched fields of that class and keeps the order', () => {
    const next = patchClassRow(list(), 'a', { endline_open: true });
    expect(next.map((c) => c.id)).toEqual(['b', 'a']);
    expect(next[1]).toEqual({ ...list()[1], endline_open: true });
    expect(next[0]).toEqual(list()[0]);
  });

  it('applied one after another, overlapping saves on different fields both survive', () => {
    // Close joining and open the end-line quiz, finishing in either order: the row ends up the same.
    const joinFirst = patchClassRow(patchClassRow(list(), 'a', { join_open: false }), 'a', { endline_open: true });
    const endlineFirst = patchClassRow(patchClassRow(list(), 'a', { endline_open: true }), 'a', { join_open: false });
    expect(joinFirst).toEqual(endlineFirst);
    expect(joinFirst[1]).toMatchObject({ join_open: false, endline_open: true });
  });

  it('ignores an unknown id and does not change the list it was given', () => {
    const before = list();
    expect(patchClassRow(before, 'zzz', { join_open: false })).toEqual(list());
    patchClassRow(before, 'a', { join_open: false });
    expect(before).toEqual(list());
  });
});
