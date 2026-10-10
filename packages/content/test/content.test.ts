import { PILLARS, REFLECTION_KEYS } from '@paisa/shared';
import { describe, expect, it } from 'vitest';
import { collectKeys, content, i18n } from '../src';

const bundleKeys = () =>
  collectKeys([content.personas, content.scenarios, content.events, content.quizzes, content.scamMessages]);

describe('content bundle', () => {
  it('parses and has a version', () => {
    expect(content.version).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });
  it('has 24 scenarios, 6 per pillar, with unique ids', () => {
    expect(content.scenarios).toHaveLength(24);
    for (const pillar of PILLARS) expect(content.scenarios.filter((s) => s.pillar === pillar)).toHaveLength(6);
    expect(new Set(content.scenarios.map((s) => s.id)).size).toBe(24);
  });
  it('has 10 events and 2 personas (sana, ravi)', () => {
    expect(content.events).toHaveLength(10);
    expect(content.personas.map((p) => p.id).sort()).toEqual(['ravi', 'sana']);
  });
  it('has 6 baseline and 6 endline questions paired by pillar and concept', () => {
    const base = content.quizzes.filter((q) => q.quiz === 'baseline');
    const end = content.quizzes.filter((q) => q.quiz === 'endline');
    expect(base).toHaveLength(6);
    expect(end).toHaveLength(6);
    base.forEach((b, i) => {
      expect(end[i]?.pillar).toBe(b.pillar);
      expect(end[i]?.concept).toBe(b.concept);
      expect(b.id.endsWith('.baseline')).toBe(true);
      expect(end[i]?.id).toBe(b.id.replace(/\.baseline$/, '.endline'));
    });
    for (const pillar of PILLARS) expect(base.some((q) => q.pillar === pillar)).toBe(true);
  });
  it('has 12 scam messages', () => {
    expect(content.scamMessages).toHaveLength(12);
  });
  it('marks every investing scenario with the assumption flag', () => {
    for (const s of content.scenarios.filter((s) => s.pillar === 'understand_investing'))
      expect(s.assumption).toBe(true);
  });
  it('gives personas reachable goals for a 3-month game', () => {
    for (const p of content.personas) {
      const inc = p.income;
      if (inc.pattern === 'irregular') throw new Error('unexpected irregular income');
      const months = inc.pattern === 'steady' ? [1, 1, 1] : inc.multipliers.slice(0, 3);
      const saved = months.reduce((sum, m) => sum + (m * inc.amount * p.split.goals) / 100, p.startingJars.goals);
      expect(saved / p.goal.amount).toBeGreaterThanOrEqual(0.7);
      expect(saved / p.goal.amount).toBeLessThanOrEqual(1);
    }
  });
});

describe('i18n', () => {
  it('has every key used by content in en and hi', () => {
    for (const lang of ['en', 'hi'] as const) {
      const missing = [...bundleKeys()].filter((k) => !i18n[lang][k]);
      expect(missing).toEqual([]);
    }
  });
  it('has the reflection prompts, common strings and the assumption banner', () => {
    const extra = [
      ...Object.values(REFLECTION_KEYS).map((k) => k.slice(2)),
      'common.ok',
      'common.continue',
      'assumption.banner',
    ];
    for (const lang of ['en', 'hi'] as const) for (const k of extra) expect(i18n[lang][k], `${lang}:${k}`).toBeTruthy();
  });
  it('has the same keys in en and hi and no orphan keys', () => {
    expect(Object.keys(i18n.hi).sort()).toEqual(Object.keys(i18n.en).sort());
    const allowed = new Set([
      ...bundleKeys(),
      ...Object.values(REFLECTION_KEYS).map((k) => k.slice(2)),
      'common.ok',
      'common.continue',
      'assumption.banner',
    ]);
    expect(Object.keys(i18n.en).filter((k) => !allowed.has(k))).toEqual([]);
  });
});
