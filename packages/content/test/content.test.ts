import { PILLARS, REFLECTION_KEYS } from '@paisa/shared';
import { describe, expect, it } from 'vitest';
import {
  badges,
  buildI18n,
  buildLanguages,
  collectKeys,
  content,
  i18n,
  isValidContentVersion,
  jarSplitRounds,
  languages,
} from '../src';
import manifest from '../manifest.json';

const bundleKeys = () =>
  collectKeys([content.personas, content.scenarios, content.events, content.quizzes, content.scamMessages]);

describe('content bundle', () => {
  it('parses and has a valid version from manifest.json', () => {
    expect(content.version).toBe(manifest.version);
    expect(isValidContentVersion(content.version)).toBe(true);
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
  it('sizes persona goals so steady saving reaches them, but one raid on the goal jar misses', () => {
    // Every goal-jar spend in the content, immediate or delayed. The smallest one is the margin.
    const raids = [...content.scenarios, ...content.events]
      .flatMap((card) => card.choices)
      .flatMap((c) => [c.effects, ...(c.delayed ?? []).map((d) => d.effects)])
      .map((e) => e.jars?.goals ?? 0)
      .filter((g) => g < 0)
      .map((g) => -g);
    expect(raids.length).toBeGreaterThan(0);
    const smallestRaid = Math.min(...raids);
    for (const p of content.personas) {
      const inc = p.income;
      if (inc.pattern === 'irregular') throw new Error('unexpected irregular income');
      const months = inc.pattern === 'steady' ? [1, 1, 1] : inc.multipliers.slice(0, 3);
      // The engine's payday: whole-rupee income, floored per jar.
      const saved = months.reduce(
        (sum, m) => sum + Math.floor((Math.round(m * inc.amount) * p.split.goals) / 100),
        p.startingJars.goals,
      );
      expect(saved, `${p.id} reaches the goal by saving the payday split`).toBeGreaterThanOrEqual(p.goal.amount);
      expect(saved - smallestRaid, `${p.id} misses after one ₹${smallestRaid} raid`).toBeLessThan(p.goal.amount);
    }
  });
});

describe('languages', () => {
  it('lists every i18n file, with en and hi required and shipped', () => {
    const codes = languages.map((l) => l.code);
    expect(codes.slice(0, 2).sort()).toEqual(['en', 'hi']);
    for (const l of languages.filter((l) => l.required)) expect(l.status).toBe('shipped');
    expect(Object.keys(i18n).sort()).toEqual([...codes].sort());
  });
  it('adds a language from its file alone, with no code change', () => {
    const files = { en: { a: 'A' }, hi: { a: 'अ' }, te: { _meta: { status: 'machine_draft' }, a: 'అ' } };
    expect(buildI18n(files, manifest).te).toEqual({ a: 'అ' });
    const te = buildLanguages(files, manifest).find((l) => l.code === 'te');
    expect(te).toMatchObject({ name: 'తెలుగు', status: 'machine_draft', required: false, dir: 'ltr' });
    const xx = buildLanguages({ ...files, xx: { a: 'x' } }, manifest).find((l) => l.code === 'xx');
    expect(xx).toMatchObject({ name: 'xx', status: 'shipped', dir: 'ltr' });
    expect(buildLanguages({ ...files, ur: { a: 'ا' } }, manifest).find((l) => l.code === 'ur')?.dir).toBe('rtl');
  });
  it('fails loudly when a required language file is missing', () => {
    expect(() => buildI18n({ en: { a: 'A' } }, manifest)).toThrow(/hi\.json/);
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
      ...collectKeys(badges),
      ...collectKeys(jarSplitRounds),
      ...Object.values(REFLECTION_KEYS).map((k) => k.slice(2)),
      'common.ok',
      'common.continue',
      'assumption.banner',
    ]);
    expect(Object.keys(i18n.en).filter((k) => !allowed.has(k))).toEqual([]);
  });
});

describe('badges', () => {
  it('parses, has unique ids, and every name and description exists in en and hi', () => {
    expect(badges.length).toBeGreaterThan(0);
    expect(new Set(badges.map((b) => b.id)).size).toBe(badges.length);
    for (const key of collectKeys(badges))
      for (const lang of ['en', 'hi'] as const) expect(i18n[lang][key], `${lang}:${key}`).toBeTruthy();
  });
});
