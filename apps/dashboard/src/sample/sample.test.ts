import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PILLARS } from '@paisa/shared';
import { isSampleSearch } from '../mode';
import { parseHash } from '../shell/route';
import { createSampleApi } from './sampleApi';
import { CHECK_QUESTIONS, CLASSROOM_QUESTIONS, buildSampleSchool, learningGainOf } from './sampleData';

const NOW = new Date('2026-10-11T06:00:00Z');
const quiz = (name: string) => {
  const raw = JSON.parse(readFileSync(join(__dirname, '../../../../packages/content/quizzes', name), 'utf8'));
  return (Array.isArray(raw) ? raw : raw.questions) as {
    id: string;
    pillar: string;
    answer: number;
    options: unknown[];
  }[];
};

describe('sample school', () => {
  const school = buildSampleSchool(NOW);

  it('is the same on every build (seeded)', () => {
    expect(buildSampleSchool(NOW)).toEqual(school);
  });

  it('is school-sized: several classes, a couple of hundred students, unique nicknames per class', () => {
    expect(school.length).toBeGreaterThanOrEqual(5);
    expect(school.reduce((n, c) => n + c.students.length, 0)).toBeGreaterThan(200);
    for (const c of school) {
      const names = c.students.map((s) => s.row.nickname);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('uses ids the router accepts and codes in the backend format', () => {
    for (const { cls, students } of school) {
      expect(parseHash(`#/class/${cls.id}/progress`)).toEqual({ name: 'class', id: cls.id, tab: 'progress' });
      expect(cls.class_code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      for (const s of students) expect(s.rejoin_code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('gives every progress row sensible numbers', () => {
    for (const { students } of school) {
      for (const { row } of students) {
        expect(row.weeks_played).toBeGreaterThanOrEqual(1);
        expect(row.weeks_played).toBeLessThanOrEqual(12);
        expect(Object.values(row.pillars).reduce((a, b) => a + b, 0)).toBe(row.decisions);
        for (const v of [row.baseline_score, row.endline_score, row.classroom_best]) {
          if (v !== null) expect(v >= 0 && v <= 100).toBe(true);
        }
        if (row.endline_score !== null) expect(row.baseline_score).not.toBeNull();
      }
    }
  });

  it('flags some students as inactive for 7+ days, relative to now', () => {
    const quiet = school
      .flatMap((c) => c.students)
      .filter((s) => NOW.getTime() - Date.parse(s.row.last_active!) >= 7 * 86_400_000);
    expect(quiet.length).toBeGreaterThan(10);
  });

  it('has classes with and without end-check results, so both gains screens can be shown', () => {
    const matched = school.map((c) => learningGainOf(c.students)[0]!.n);
    expect(matched.some((n) => n > 0)).toBe(true);
    expect(matched.some((n) => n === 0)).toBe(true);
  });

  it('averages learning gains over students who took both checks only', () => {
    const { students } = school.find((c) => learningGainOf(c.students)[0]!.n > 0)!;
    const both = students.filter((s) => s.baseline && s.endline);
    const rows = learningGainOf(students);
    expect(rows.map((r) => r.pillar)).toEqual([...PILLARS]);
    const want = both.reduce((sum, s) => sum + s.baseline!.plan_budget, 0) / both.length;
    expect(rows[0]!.baseline_avg).toBeCloseTo(want, 1);
    expect(rows[0]!.n).toBe(both.length);
  });
});

describe('sample data matches the content pack', () => {
  it('classroom questions: same ids, areas, answers and option counts', () => {
    expect(
      quiz('classroom.json').map((q) => ({ id: q.id, pillar: q.pillar, answer: q.answer, options: q.options.length })),
    ).toEqual(CLASSROOM_QUESTIONS);
  });

  it('start check: same number of questions per area', () => {
    const counts: Record<string, number> = {};
    for (const q of quiz('baseline.json')) counts[q.pillar] = (counts[q.pillar] ?? 0) + 1;
    expect(counts).toEqual(CHECK_QUESTIONS);
  });

  it('never names the most-picked wrong answer as the right one', () => {
    for (const { classroom } of buildSampleSchool(NOW)) {
      for (const r of classroom) {
        const q = CLASSROOM_QUESTIONS.find((x) => x.id === r.question_id)!;
        expect(r.top_wrong_choice).not.toBe(q.answer);
      }
    }
  });
});

describe('sample api', () => {
  it('signs in, or creates an account, with any email and any password', async () => {
    const api = createSampleApi({ now: NOW, delayMs: 0 });
    expect(await api.currentEmail()).toBeNull();
    await api.signInWithPassword(' Anyone@School.org ', 'x');
    expect(await api.currentEmail()).toBe('anyone@school.org');
    expect(await api.isStaff()).toBe(true);
    await api.signOut();
    expect(await api.signUpWithPassword('new@school.org', 'whatever')).toEqual({ signedIn: true });
    expect(await api.currentEmail()).toBe('new@school.org');
  });

  it('sends no reset email, so a reset link never works', async () => {
    const api = createSampleApi({ now: NOW, delayMs: 0 });
    await api.sendPasswordReset('a@b.org', 'http://x/');
    await expect(api.verifyPasswordReset('hash')).rejects.toMatchObject({ code: 'auth_link_invalid' });
    expect(await api.currentEmail()).toBeNull();
  });

  it('tells listeners about sign-in and sign-out', async () => {
    const api = createSampleApi({ now: NOW, delayMs: 0 });
    const seen: (string | null)[] = [];
    const off = api.onAuthChange((e) => seen.push(e));
    await api.signInWithPassword('a@b.org', 'pw');
    await api.signOut();
    off();
    await api.signInWithPassword('c@d.org', 'pw');
    expect(seen).toEqual(['a@b.org', null]);
  });

  it('refuses data before sign-in', async () => {
    const api = createSampleApi({ now: NOW, delayMs: 0 });
    await expect(api.listClasses()).rejects.toMatchObject({ code: 'not_signed_in' });
  });

  it('creates and changes classes in memory', async () => {
    const api = createSampleApi({ now: NOW, delayMs: 0 });
    await api.signInWithPassword('a@b.org', 'pw');
    const before = await api.listClasses();
    const cls = await api.createClass('Class 9 C', 'hi');
    const after = await api.listClasses();
    expect(after).toHaveLength(before.length + 1);
    expect(after[0]).toEqual(cls);
    expect(await api.classProgress(cls.id)).toEqual([]);

    await api.setJoinOpen(cls.id, false);
    await api.setEndlineOpen(cls.id, true);
    const code = await api.rotateClassCode(cls.id);
    expect((await api.listClasses())[0]).toMatchObject({ join_open: false, endline_open: true, class_code: code });
    await expect(api.setJoinOpen('nope', true)).rejects.toMatchObject({ code: 'class_not_found' });
  });

  it('resets a rejoin code', async () => {
    const api = createSampleApi({ now: NOW, delayMs: 0 });
    await api.signInWithPassword('a@b.org', 'pw');
    const [cls] = await api.listClasses();
    const [first] = await api.listStudents(cls!.id);
    const code = await api.resetRejoinCode(first!.anon_id);
    expect((await api.listStudents(cls!.id)).find((s) => s.anon_id === first!.anon_id)!.rejoin_code).toBe(code);
  });

  it('keeps the sign-in in the given storage', async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    await createSampleApi({ now: NOW, delayMs: 0, storage }).signInWithPassword('a@b.org', 'pw');
    expect(await createSampleApi({ now: NOW, delayMs: 0, storage }).currentEmail()).toBe('a@b.org');
  });
});

describe('isSampleSearch', () => {
  it('is on for ?demo=1 and off otherwise', () => {
    expect(isSampleSearch('?demo=1')).toBe(true);
    expect(isSampleSearch('?demo')).toBe(true);
    expect(isSampleSearch('?code=ABC&demo=1')).toBe(true);
    expect(isSampleSearch('')).toBe(false);
    expect(isSampleSearch('?demo=0')).toBe(false);
    expect(isSampleSearch('?demo=false')).toBe(false);
  });
});
