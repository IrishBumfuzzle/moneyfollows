import { describe, expect, it } from 'vitest';
import { i18n, jarSplitRounds, type JarSplitRound } from '@paisa/content';
import { EngineError, emptySplit, jarSplitterRounds, scoreJarSplit, type JarSplit } from '../src';
import { deepFreeze } from './fixtures';

const round: JarSplitRound = {
  id: 'jar.test.01',
  personas: ['sana'],
  levels: ['starter'],
  text: 't:jar.test.01.story',
  lesson: 't:jar.test.01.lesson',
  income: 4000,
  step: 100,
  checks: [
    { id: 'needs', kind: 'min_jar', jar: 'needs', amount: 2000, ok: 't:ok.needs', fix: 't:fix.needs' },
    { id: 'save', kind: 'min_share', jars: ['goals', 'savings'], percent: 20, ok: 't:ok.save', fix: 't:fix.save' },
    { id: 'wants', kind: 'max_share', jars: ['wants'], percent: 30, ok: 't:ok.wants', fix: 't:fix.wants' },
  ],
  meta: { status: 'reviewed', author: 'test' },
};
const split = (needs: number, wants: number, goals: number, savings: number): JarSplit => ({
  needs,
  wants,
  goals,
  savings,
});

describe('scoreJarSplit', () => {
  it('passes a complete split that meets every check', () => {
    const r = scoreJarSplit(round, split(2000, 1200, 400, 400));
    expect(r).toMatchObject({ total: 4000, remaining: 0, complete: true, passed: 3, allPassed: true });
    expect(r.checks.map((c) => c.feedback)).toEqual(['t:ok.needs', 't:ok.save', 't:ok.wants']);
  });

  it('checks thresholds exactly at the edge', () => {
    // 20% of 4000 = 800 saved, 30% = 1200 wants: both on the line, both pass.
    expect(scoreJarSplit(round, split(2000, 1200, 800, 0)).allPassed).toBe(true);
    expect(scoreJarSplit(round, split(2001, 1199, 799, 1)).checks[1]!.ok).toBe(true);
    const under = scoreJarSplit(round, split(2101, 1200, 699, 0));
    expect(under.checks[1]).toEqual({
      id: 'save',
      ok: false,
      feedback: 't:fix.save',
      values: { amount: 800, short: 101, percent: 20 },
    });
    const over = scoreJarSplit(round, split(2000, 1201, 799, 0));
    expect(over.checks[2]).toEqual({
      id: 'wants',
      ok: false,
      feedback: 't:fix.wants',
      values: { amount: 1200, short: 1, percent: 30 },
    });
  });

  it('reports how short Needs is', () => {
    const r = scoreJarSplit(round, split(1500, 1000, 1000, 500));
    expect(r.checks[0]).toEqual({
      id: 'needs',
      ok: false,
      feedback: 't:fix.needs',
      values: { amount: 2000, short: 500 },
    });
    expect(r.passed).toBe(2);
    expect(r.allPassed).toBe(false);
  });

  it('reports rupees left to place, or placed beyond the income', () => {
    expect(scoreJarSplit(round, emptySplit())).toMatchObject({ total: 0, remaining: 4000, complete: false });
    const over = scoreJarSplit(round, split(2500, 1200, 400, 400));
    expect(over).toMatchObject({ remaining: -500, complete: false, allPassed: false });
    // Checks still run on an incomplete split, so the UI can show live feedback.
    expect(over.checks.every((c) => c.ok)).toBe(true);
  });

  it('rejects negative or fractional amounts', () => {
    expect(() => scoreJarSplit(round, split(-100, 0, 0, 0))).toThrow(EngineError);
    expect(() => scoreJarSplit(round, split(10.5, 0, 0, 0))).toThrow(EngineError);
    expect(() => scoreJarSplit(round, { ...split(0, 0, 0, 0), wants: Number.NaN })).toThrow(EngineError);
  });

  it('is pure: same input, same output, and inputs are not mutated', () => {
    const frozenRound = deepFreeze(structuredClone(round));
    const frozenSplit = deepFreeze(split(2000, 1200, 400, 400));
    expect(scoreJarSplit(frozenRound, frozenSplit)).toEqual(scoreJarSplit(round, split(2000, 1200, 400, 400)));
  });
});

describe('jarSplitterRounds', () => {
  it('filters by persona and level', () => {
    const sanaStarter = jarSplitterRounds('sana', 'starter').map((r) => r.id);
    expect(sanaStarter).toContain('jar.sana_payday.01');
    expect(sanaStarter).not.toContain('jar.ravi_payday.01');
    expect(sanaStarter).not.toContain('jar.exam_month.01');
    expect(jarSplitterRounds('sana', 'explorer').map((r) => r.id)).toContain('jar.exam_month.01');
  });

  it('gives every shipped persona at least one round at every level', () => {
    for (const persona of ['sana', 'ravi'] as const)
      for (const level of ['starter', 'explorer', 'planner'] as const)
        expect(jarSplitterRounds(persona, level).length, `${persona}/${level}`).toBeGreaterThan(0);
  });
});

describe('bundled Jar Splitter rounds', () => {
  /** Every split on the round's slider step that places all the money. */
  function* splitsOnStep(r: JarSplitRound): Generator<JarSplit> {
    for (let needs = 0; needs <= r.income; needs += r.step)
      for (let wants = 0; needs + wants <= r.income; wants += r.step)
        for (let goals = 0; needs + wants + goals <= r.income; goals += r.step)
          yield split(needs, wants, goals, r.income - needs - wants - goals);
  }

  it('every round can be solved on its slider step, and not by every split', () => {
    for (const r of jarSplitRounds) {
      let solvable = false;
      let failing = false;
      for (const s of splitsOnStep(r)) {
        if (scoreJarSplit(r, s).allPassed) solvable = true;
        else failing = true;
        if (solvable && failing) break;
      }
      expect(solvable, `${r.id} has no passing split`).toBe(true);
      expect(failing, `${r.id} passes with any split`).toBe(true);
    }
  });

  it('feedback keys exist in en and hi with the placeholders each check fills', () => {
    for (const r of jarSplitRounds)
      for (const c of r.checks)
        for (const key of [c.ok, c.fix])
          for (const lang of ['en', 'hi'] as const) {
            const text = i18n[lang][key.slice(2)];
            expect(text, `${lang}:${key}`).toBeTruthy();
            const used = [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
            const filled = c.kind === 'min_jar' ? ['amount', 'short'] : ['amount', 'short', 'percent'];
            for (const name of used) expect(filled, `${lang}:${key} uses {{${name}}}`).toContain(name);
          }
  });
});
