import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContentPack, type ContentSource, type Scenario, type ScamMessage } from '@paisa/contracts';
import { buildPacks, collectKeys, lintGuardrails, loadContentDir, validateSource } from '../src';

const FIXTURES = resolve(import.meta.dirname, '../../../content/fixtures');

function fixtures(): ContentSource {
  const { source, issues } = loadContentDir(FIXTURES);
  expect(issues).toEqual([]);
  return source;
}

const recharge = (): Scenario => structuredClone(fixtures().scenarios.find((s) => s.id === 'budget.recharge.01')!);

describe('loadContentDir', () => {
  it('loads every kind from the fixture pack', () => {
    const s = fixtures();
    expect(s.scenarios.length).toBe(4);
    expect(s.events.length).toBe(2);
    expect(s.personas.map((p) => p.id).sort()).toEqual(['ravi', 'sana']);
    expect(s.quizQuestions.length).toBe(10);
    expect(s.scamMessages.length).toBe(2);
    expect(s.tuning?.months).toBe(12);
    expect(s.strings.en).toBeDefined();
  });

  it('reports a file that fails its schema instead of throwing', () => {
    const { issues } = loadContentDir(resolve(FIXTURES, 'does-not-exist'));
    expect(issues).toEqual([]);
  });
});

describe('validateSource', () => {
  it('passes the fixture pack with no errors', () => {
    const report = validateSource(fixtures());
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('fails when a key has no English text', () => {
    const s = fixtures();
    delete s.strings.en!['recharge_basic'];
    const report = validateSource(s);
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ rule: 'missing_string', itemId: 'recharge_basic' }));
  });

  it('fails when a second language is incomplete', () => {
    const s = fixtures();
    s.strings.hi = { 'common.ok': 'ठीक है' };
    const report = validateSource(s);
    expect(report.issues.some((i) => i.rule === 'missing_string' && i.message.includes(' hi '))).toBe(true);
  });

  it('flags duplicate ids across kinds', () => {
    const s = fixtures();
    s.events[0] = { ...s.events[0]!, id: 'budget.recharge.01' };
    expect(validateSource(s).issues).toContainEqual(expect.objectContaining({ rule: 'duplicate_id' }));
  });

  it('requires tuning', () => {
    const s = fixtures();
    delete s.tuning;
    expect(validateSource(s).issues).toContainEqual(expect.objectContaining({ rule: 'tuning_missing' }));
  });
});

describe('lintGuardrails', () => {
  const lint = (item: Scenario | ScamMessage, en: Record<string, string>) => lintGuardrails(item, { en });

  it('passes clean text', () => {
    expect(lint(recharge(), fixtures().strings.en!)).toEqual([]);
  });

  it('blocks real brand names in any language', () => {
    const issues = lintGuardrails(recharge(), { hi: { 'budget.recharge.01.story': 'Paytm से रिचार्ज करो' } });
    expect(issues).toContainEqual(expect.objectContaining({ rule: 'real_brand' }));
  });

  it('matches whole words only', () => {
    expect(lint(recharge(), { 'budget.recharge.01.story': 'A public bus and a clinic.' })).toEqual([]);
  });

  it('blocks promises and advice', () => {
    const issues = lint(recharge(), { 'budget.recharge.01.story': 'You should invest now for guaranteed growth.' });
    expect(issues.filter((i) => i.rule === 'promise').length).toBeGreaterThan(0);
  });

  it('allows only the safety links and the 1930 helpline', () => {
    expect(lint(recharge(), { 'budget.recharge.01.story': 'Report it on 1930 or cybercrime.gov.in.' })).toEqual([]);
    const issues = lint(recharge(), { 'budget.recharge.01.story': 'Visit www.example.com or call 9876543210.' });
    expect(issues.map((i) => i.rule).sort()).toEqual(['link', 'phone']);
  });

  it('lets scam messages show fake links so students learn to spot them', () => {
    const scam = fixtures().scamMessages.find((m) => m.verdict === 'scam')!;
    expect(lint(scam, fixtures().strings.en!).filter((i) => i.rule === 'link')).toEqual([]);
  });

  it('rejects single-number returns and a missing assumption flag on investing cards', () => {
    const card: Scenario = { ...recharge(), pillar: 'understand_investing' };
    const issues = lint(card, { 'budget.recharge.01.story': 'Mixed Basket grows 12% a year.' });
    expect(issues.map((i) => i.rule).sort()).toEqual(['assumption_banner', 'single_number']);
    const ok = lint({ ...card, assumption: true }, { 'budget.recharge.01.story': 'It might grow 4% to 12% a year, or fall.' });
    expect(ok).toEqual([]);
  });

  it('enforces English length caps by key suffix', () => {
    const issues = lint(recharge(), { 'budget.recharge.01.story': 'x'.repeat(221) });
    expect(issues).toContainEqual(expect.objectContaining({ rule: 'length' }));
  });
});

describe('buildPacks', () => {
  const options = { version: '2026.10.1', region: 'hyderabad', languages: ['en' as const] };

  it('builds a valid pack with only the strings it uses', () => {
    const s = fixtures();
    const [artifact] = buildPacks(s, options);
    const pack = ContentPack.parse(JSON.parse(artifact!.body));
    expect(pack.manifest).toEqual({ region: 'hyderabad', language: 'en', version: '2026.10.1' });
    expect(Object.keys(pack.strings).sort()).toEqual([...collectKeys({ ...pack, strings: {}, manifest: {} })].sort());
    expect(artifact!.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(buildPacks(fixtures(), options)).toEqual(buildPacks(fixtures(), options));
  });

  it('filters by region and falls back to English for missing keys', () => {
    const s = fixtures();
    s.scenarios[0] = { ...s.scenarios[0]!, regions: ['vizag'] };
    s.strings.hi = { 'common.ok': 'ठीक है' };
    const [en, hi] = buildPacks(s, { ...options, languages: ['en', 'hi'] });
    const enPack = ContentPack.parse(JSON.parse(en!.body));
    const hiPack = ContentPack.parse(JSON.parse(hi!.body));
    expect(enPack.scenarios.map((x) => x.id)).not.toContain(s.scenarios[0]!.id);
    expect(hiPack.strings['common.ok']).toBe('ठीक है');
    expect(hiPack.strings['recharge_basic']).toBe(s.strings.en!['recharge_basic']);
  });
});

describe('scam message exemptions', () => {
  it('allows scam hooks in scam messages but never real brands', () => {
    const scam = structuredClone(fixtures().scamMessages.find((m) => m.verdict === 'scam')!);
    const key = scam.segments[0]!.text.slice(2);
    expect(lintGuardrails(scam, { en: { [key]: 'Double your money in 1 day!' } })).toEqual([]);
    expect(lintGuardrails(scam, { en: { [key]: 'Send money on Paytm' } })).toContainEqual(expect.objectContaining({ rule: 'real_brand' }));
  });
});
