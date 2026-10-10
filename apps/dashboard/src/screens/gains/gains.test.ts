import { describe, expect, it } from 'vitest';
import type { ClassroomQuizSummaryRow } from '@paisa/shared';
import { STRINGS, t } from './content';
import {
  chartData,
  hasNoGains,
  orderRows,
  questionText,
  sortStruggles,
  summarizeGains,
  wrapLabel,
  wrongAnswer,
  type GainRow,
  type PackDicts,
} from './gains';
import { loadQuestionDicts } from './questions';

const row = (pillar: GainRow['pillar'], baseline: number | null, endline: number | null, n: number): GainRow => ({
  pillar,
  baseline_avg: baseline,
  endline_avg: endline,
  baseline_n: n,
  endline_n: n,
  n,
});

const full: GainRow[] = [
  row('plan_budget', 40, 70, 16),
  row('save_manage', 50, 75, 16),
  row('understand_investing', 45, 65, 15),
  row('stay_safe', 55, 75, 16),
];
const none: GainRow[] = full.map((r) => row(r.pillar, null, null, 0));

describe('learning gains content (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi).sort()).toEqual(Object.keys(STRINGS.en).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang])) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('only uses placeholders the screen fills in', () => {
    // English says "{{students}}" (16 students); Hindi says "({{n}})": both are passed.
    const known = new Set(['from', 'to', 'n', 'students']);
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang])) {
        for (const m of v.matchAll(/\{\{(\w+)\}\}/g)) expect(known.has(m[1]), `${lang} ${k} {{${m[1]}}}`).toBe(true);
      }
    }
  });
});

describe('hasNoGains / orderRows', () => {
  it('is empty only when no pillar has matched students', () => {
    expect(hasNoGains(none)).toBe(true);
    expect(hasNoGains([])).toBe(true);
    expect(hasNoGains([...none.slice(0, 3), row('stay_safe', 50, 60, 4)])).toBe(false);
  });

  it('treats a row with students but null averages as no data', () => {
    expect(hasNoGains([row('plan_budget', null, 60, 3)])).toBe(true);
  });

  it('returns the four pillars in order and fills in missing ones', () => {
    const ordered = orderRows([full[3], full[0]]);
    expect(ordered.map((r) => r.pillar)).toEqual(['plan_budget', 'save_manage', 'understand_investing', 'stay_safe']);
    expect(ordered[1]).toMatchObject({ baseline_avg: null, endline_avg: null, n: 0 });
    expect(ordered[0]).toBe(full[0]);
  });
});

describe('summarizeGains', () => {
  it('averages over the pillars with data and takes the biggest group as the headcount', () => {
    expect(summarizeGains(full)).toEqual({ from: 48, to: 71, students: 16, direction: 'up' });
  });

  it('skips pillars without data on both sides of the comparison', () => {
    // Only plan_budget counts: 40 -> 70, not (40 + 0) / 2.
    const rows = [row('plan_budget', 40, 70, 8), ...none.slice(1)];
    expect(summarizeGains(rows)).toEqual({ from: 40, to: 70, students: 8, direction: 'up' });
  });

  it('says fell and same', () => {
    expect(summarizeGains([row('plan_budget', 80, 60, 5)])?.direction).toBe('down');
    expect(summarizeGains([row('plan_budget', 60, 60, 5)])?.direction).toBe('same');
  });

  it('compares the rounded numbers so the sentence matches what is shown', () => {
    expect(summarizeGains([row('plan_budget', 50.2, 50.4, 5)])).toMatchObject({ from: 50, to: 50, direction: 'same' });
  });

  it('is null when nothing is matched', () => {
    expect(summarizeGains(none)).toBeNull();
    expect(summarizeGains([])).toBeNull();
  });

  it('builds a readable sentence in both languages', () => {
    const s = summarizeGains(full)!;
    const vars = { from: s.from, to: s.to, n: s.students, students: t('en', 'students.other', { n: s.students }) };
    expect(t('en', 'summary.up', vars)).toBe(
      'Average score rose from 48% to 71% across 16 students who took both checks.',
    );
    expect(t('hi', 'summary.up', vars)).toContain('48%');
    expect(t('hi', 'summary.up', vars)).not.toContain('{{');
  });
});

describe('chartData', () => {
  it('keeps pillar order and gives unmatched pillars no bars', () => {
    const data = chartData([full[0], row('stay_safe', null, null, 0)]);
    expect(data.map((d) => d.pillar)).toEqual(['plan_budget', 'save_manage', 'understand_investing', 'stay_safe']);
    expect(data[0]).toEqual({ pillar: 'plan_budget', baseline: 40, endline: 70, n: 16 });
    expect(data[3]).toEqual({ pillar: 'stay_safe', baseline: null, endline: null, n: 0 });
  });
});

describe('wrapLabel', () => {
  it('breaks on words under the limit', () => {
    expect(wrapLabel('Understand investing')).toEqual(['Understand', 'investing']);
    expect(wrapLabel('Plan & budget')).toEqual(['Plan & budget']);
    expect(wrapLabel('Stay financially safe')).toEqual(['Stay', 'financially', 'safe']);
    expect(wrapLabel('आर्थिक रूप से सुरक्षित रहना')).toEqual(['आर्थिक रूप से', 'सुरक्षित रहना']);
  });

  it('never makes more lines than allowed and never drops words', () => {
    const lines = wrapLabel('one two three four five six seven eight', 6, 3);
    expect(lines).toHaveLength(3);
    expect(lines.join(' ')).toBe('one two three four five six seven eight');
  });

  it('copes with empty and long single words', () => {
    expect(wrapLabel('')).toEqual([]);
    expect(wrapLabel('Supercalifragilistic')).toEqual(['Supercalifragilistic']);
  });
});

const q = (
  question_id: string,
  correct_pct: number,
  attempts = 10,
  top_wrong_choice: number | null = 0,
): ClassroomQuizSummaryRow => ({
  question_id,
  pillar: 'plan_budget',
  attempts,
  students: attempts,
  correct_pct,
  top_wrong_choice,
});

describe('sortStruggles', () => {
  it('puts the lowest percent correct first without touching the input', () => {
    const input = [q('b', 80), q('a', 20), q('c', 50)];
    expect(sortStruggles(input).map((r) => r.question_id)).toEqual(['a', 'c', 'b']);
    expect(input.map((r) => r.question_id)).toEqual(['b', 'a', 'c']);
  });

  it('breaks ties by more attempts, then by id', () => {
    const sorted = sortStruggles([q('z', 50, 5), q('y', 50, 9), q('x', 50, 9)]);
    expect(sorted.map((r) => r.question_id)).toEqual(['x', 'y', 'z']);
  });
});

describe('question and option text', () => {
  const dicts: PackDicts = {
    en: {
      'quiz.x.q': 'English question',
      'quiz.x.o1': 'First',
      'quiz.x.o2': 'Second',
      'quiz.only_en.q': 'Only English',
    },
    hi: { 'quiz.x.q': 'हिंदी सवाल', 'quiz.x.o1': 'पहला', 'quiz.x.o2': 'दूसरा' },
  };

  it('reads the question from id + .q in the chosen language', () => {
    expect(questionText(dicts, 'en', 'quiz.x')).toBe('English question');
    expect(questionText(dicts, 'hi', 'quiz.x')).toBe('हिंदी सवाल');
  });

  it('falls back to English, then to the raw id', () => {
    expect(questionText(dicts, 'hi', 'quiz.only_en')).toBe('Only English');
    expect(questionText(dicts, 'en', 'quiz.unknown')).toBe('quiz.unknown');
    expect(questionText({}, 'hi', 'quiz.x')).toBe('quiz.x');
  });

  it('maps the 0-based wrong choice to the 1-based option key', () => {
    expect(wrongAnswer(dicts, 'en', 'quiz.x', 0)).toEqual({ position: 1, text: 'First' });
    expect(wrongAnswer(dicts, 'hi', 'quiz.x', 1)).toEqual({ position: 2, text: 'दूसरा' });
  });

  it('has no wrong answer when null, and no text when the key is missing', () => {
    expect(wrongAnswer(dicts, 'en', 'quiz.x', null)).toBeNull();
    expect(wrongAnswer(dicts, 'en', 'quiz.x', 3)).toEqual({ position: 4, text: null });
  });
});

describe('content pack', () => {
  it('resolves every classroom question and its options in en and hi', async () => {
    const dicts = await loadQuestionDicts();
    const ids = Object.keys(dicts.en ?? {})
      .filter((k) => k.startsWith('quiz.classroom.') && k.endsWith('.q'))
      .map((k) => k.slice(0, -2));
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const lang of ['en', 'hi'] as const) {
      for (const id of ids) {
        expect(questionText(dicts, lang, id), `${lang} ${id}`).not.toBe(id);
        for (const choice of [0, 1])
          expect(wrongAnswer(dicts, lang, id, choice)?.text, `${lang} ${id} option ${choice + 1}`).toBeTruthy();
      }
    }
  });
});
