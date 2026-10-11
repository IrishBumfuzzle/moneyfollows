import { describe, expect, it } from 'vitest';
import { projectGrowth } from '@paisa/engine';
import { GROWTH_RATES } from '@paisa/shared';
import { STRINGS } from './content';
import { JAR_ORDER, emptySplit, roundsFor, scoreGame, scoreJarSplit, setJar } from './jars';
import { CHALLENGES, MONTHLY, YEARS, answer, rangeAt, scoreRound } from './timeMachine';

describe('Time Machine range (CLAUDE.md 5.4)', () => {
  it('shows low < average < high at every slider end, never a single number', () => {
    for (const m of [MONTHLY.min, MONTHLY.start, MONTHLY.max]) {
      for (const y of [YEARS.min, YEARS.start, YEARS.max]) {
        const r = rangeAt(projectGrowth(m, y, GROWTH_RATES), y);
        expect(r.low, `${m}/${y}`).toBeLessThan(r.avg);
        expect(r.avg, `${m}/${y}`).toBeLessThan(r.high);
        expect(r.low).toBeGreaterThanOrEqual(m * 12 * y); // low rate is above 0%
      }
    }
  });
});

describe('Time Machine questions', () => {
  it('every question has one honest answer: the ranges never overlap', () => {
    for (const c of CHALLENGES) expect(answer(c), c.id).not.toBeNull();
  });

  it('teaches what it says: time beats amount, early beats more, more beats less', () => {
    expect(CHALLENGES.map((c) => [c.id, answer(c)])).toEqual([
      ['time_beats_amount', 'b'],
      ['start_early', 'a'],
      ['more_each_month', 'a'],
    ]);
  });

  it('scores a round out of 3', () => {
    expect(scoreRound(['b', 'a', 'a'])).toEqual({ correct: 3, total: 3, score: 100 });
    expect(scoreRound(['a', 'a', 'b'])).toEqual({ correct: 1, total: 3, score: 33 });
    expect(scoreRound([])).toEqual({ correct: 0, total: 3, score: 0 });
  });
});

describe('bank strings (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys, the same {{vars}} and no empty strings', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(STRINGS.en!)) {
      expect(v.trim(), k).not.toBe('');
      expect(vars(STRINGS.hi![k]!), k).toEqual(vars(v));
    }
  });

  it('has a reason for every question and names only the fictional assets', () => {
    for (const c of CHALLENGES) expect(STRINGS.en![`tm.q.why.${c.id}`], c.id).toBeDefined();
    const all = Object.values(STRINGS.en!).join(' ');
    expect(all).not.toMatch(/guarantee|risk-free|sure returns|you should invest/i);
    expect(STRINGS.en!['tm.assumption']).toMatch(/not promises/);
  });
});

describe('Jar Splitter (practice)', () => {
  it('every persona gets rounds, and each round can pass every check', () => {
    for (const persona of ['sana', 'ravi'] as const) {
      const rounds = roundsFor(persona);
      expect(rounds.length, persona).toBeGreaterThan(0);
      for (const r of rounds) {
        // A sensible split: needs first, then the saving share, the rest to wants.
        let s = setJar(r, emptySplit(), 'needs', Math.ceil(r.income / 2 / r.step) * r.step);
        s = setJar(r, s, 'savings', Math.ceil((r.income * 0.25) / r.step) * r.step);
        s = setJar(r, s, 'wants', r.income);
        const res = scoreJarSplit(r, s);
        expect(res.complete, r.id).toBe(true);
        expect(res.allPassed, r.id).toBe(true);
      }
    }
  });

  it('setJar snaps to the step, never goes below 0 or past the income, never mutates', () => {
    const r = { income: 1000, step: 100 };
    const s = emptySplit();
    expect(setJar(r, s, 'needs', 449).needs).toBe(400);
    expect(setJar(r, s, 'needs', -50).needs).toBe(0);
    const full = setJar(r, setJar(r, s, 'needs', 700), 'wants', 900);
    expect(full.wants).toBe(300);
    expect(JAR_ORDER.reduce((n, j) => n + full[j], 0)).toBe(1000);
    expect(s).toEqual(emptySplit());
  });

  it('scores a game as checks met of all checks', () => {
    const r = roundsFor('sana')[0]!;
    const res = scoreJarSplit(r, setJar(r, emptySplit(), 'wants', r.income));
    expect(scoreGame([res])).toEqual({ correct: res.passed, total: res.checks.length, score: Math.round((100 * res.passed) / res.checks.length) });
  });
});
