// The quiz rules themselves are tested in packages/engine (quiz-session.test.ts). These cover
// the classroom's config acceptor and that the screen's strings and the pack line up.
import { startQuiz } from '@paisa/engine';
import { PILLARS } from '@paisa/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CLASSROOM, normalizeConfig } from './config';
import { CLASSROOM_BANK, STRINGS } from './content';

describe('classroom bank (from @paisa/content)', () => {
  it('has classroom questions across all four pillars, with en and hi strings', () => {
    expect(CLASSROOM_BANK.length).toBeGreaterThanOrEqual(PILLARS.length);
    expect(new Set(CLASSROOM_BANK.map((q) => q.pillar))).toEqual(new Set(PILLARS));
    for (const q of CLASSROOM_BANK) {
      for (const k of [q.text, q.explanation, ...q.options]) {
        expect(STRINGS.en, k).toHaveProperty([k.slice(2)]);
        expect(STRINGS.hi, k).toHaveProperty([k.slice(2)]);
      }
    }
  });

  it('UI strings have the same keys in en and hi, and the intro shows the real count', () => {
    const ui = (l: 'en' | 'hi') => Object.keys(STRINGS[l]!).filter((k) => k.startsWith('classroom.')).sort();
    expect(ui('hi')).toEqual(ui('en'));
    expect(STRINGS.en!['classroom.intro']).toContain('{{count}}');
    expect(STRINGS.hi!['classroom.intro']).toContain('{{count}}');
  });
});

describe('normalizeConfig (class settings → a playable round)', () => {
  it('defaults to 5 questions across all pillars', () => {
    expect(normalizeConfig(undefined, CLASSROOM_BANK)).toEqual(DEFAULT_CLASSROOM);
    expect(normalizeConfig({}, CLASSROOM_BANK)).toEqual({ count: 5 });
  });

  it('takes the facilitator\'s count, clamped to 1..bank size', () => {
    expect(normalizeConfig({ count: 3 }, CLASSROOM_BANK)).toEqual({ count: 3 });
    expect(normalizeConfig({ count: 0 }, CLASSROOM_BANK).count).toBe(1);
    expect(normalizeConfig({ count: 999 }, CLASSROOM_BANK).count).toBe(CLASSROOM_BANK.length);
    expect(normalizeConfig({ count: 2.6 }, CLASSROOM_BANK).count).toBe(3);
    expect(normalizeConfig({ count: 'lots' }, CLASSROOM_BANK).count).toBe(5);
  });

  it('limits to chosen pillars, capping the count to their questions; drops unknown pillars', () => {
    const safe = CLASSROOM_BANK.filter((q) => q.pillar === 'stay_safe').length;
    expect(normalizeConfig({ count: 10, pillars: ['stay_safe', 'nonsense'] }, CLASSROOM_BANK)).toEqual({ count: safe, pillars: ['stay_safe'] });
    expect(normalizeConfig({ count: 4, pillars: [] }, CLASSROOM_BANK)).toEqual({ count: 4 });
    expect(normalizeConfig({ count: 4, pillars: ['nonsense'] }, CLASSROOM_BANK)).toEqual({ count: 4 });
  });

  it('every normalized config starts a valid engine round of exactly that size', () => {
    const inputs = [undefined, { count: 1 }, { count: 999 }, { count: 7, pillars: ['plan_budget', 'stay_safe'] }, { pillars: ['understand_investing'] }];
    for (const raw of inputs) {
      const cfg = normalizeConfig(raw, CLASSROOM_BANK);
      const s = startQuiz(CLASSROOM_BANK, { kind: 'classroom', seed: 42, count: cfg.count, pillars: cfg.pillars });
      expect(s.questions).toHaveLength(cfg.count);
      if (cfg.pillars) for (const q of s.questions) expect(cfg.pillars).toContain(q.pillar);
    }
  });
});
