import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateContent, type ContentFile, type Guardrails, type Issue } from '../../packages/content/src/validate';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'packages', 'content');
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const guardrails = readJson('guardrails.json') as Guardrails;

const meta = { status: 'reviewed', author: 'test' } as const;
const choice = (id: string, key: string) => ({
  id,
  label: `t:${key}.${id}.label`,
  effects: {},
  lesson: `t:${key}.${id}.lesson`,
});
const scenario = (over: Record<string, unknown> = {}) => ({
  id: 'budget.test.01',
  pillar: 'plan_budget',
  concept: 'test',
  personas: ['sana'],
  difficulty: 1,
  text: 't:budget.test.01.story',
  choices: [choice('a', 'budget.test.01'), choice('b', 'budget.test.01')],
  meta,
  ...over,
});
const baseTexts = (key = 'budget.test.01') => ({
  [`${key}.story`]: 'Payday is here.',
  [`${key}.a.label`]: 'Save first',
  [`${key}.a.lesson`]: 'Saving first makes it happen.',
  [`${key}.b.label`]: 'Spend first',
  [`${key}.b.lesson`]: 'Spending first leaves less.',
});

function run(opts: {
  items?: unknown[];
  file?: string;
  en?: Record<string, unknown>;
  hi?: Record<string, unknown> | null;
  extra?: Record<string, Record<string, unknown>>;
  strict?: boolean;
  files?: ContentFile[];
}): Issue[] {
  const items = opts.items ?? [scenario()];
  const en = opts.en ?? baseTexts();
  const hi = opts.hi === undefined ? en : opts.hi;
  return validateContent(
    {
      files: opts.files ?? [{ path: opts.file ?? 'scenarios/plan_budget.json', data: items }],
      i18n: { en, ...(hi ? { hi } : {}), ...opts.extra },
      guardrails,
    },
    { strict: opts.strict ?? false },
  );
}
// Distinct rule names. Tests reuse the English text as Hindi, so the same rule fires once per language.
const rules = (issues: Issue[], severity?: Issue['severity']) => [
  ...new Set(issues.filter((i) => !severity || i.severity === severity).map((i) => i.rule)),
];

const investing = (over: Record<string, unknown> = {}) =>
  scenario({
    id: 'invest.test.01',
    pillar: 'understand_investing',
    assumption: true,
    text: 't:invest.test.01.story',
    choices: [choice('a', 'invest.test.01'), choice('b', 'invest.test.01')],
    ...over,
  });
const investingTexts = (story: string) => ({ ...baseTexts('invest.test.01'), 'invest.test.01.story': story });

describe('rule 1: schema, choice counts, unique ids', () => {
  it('accepts a valid scenario', () => {
    expect(run({})).toEqual([]);
  });
  it('flags schema errors', () => {
    expect(rules(run({ items: [scenario({ difficulty: 7 })] }))).toContain('schema');
  });
  it('needs 2 to 4 scenario choices', () => {
    const one = scenario({ choices: [choice('a', 'budget.test.01')] });
    expect(rules(run({ items: [one] }))).toContain('schema');
    const five = scenario({ choices: ['a', 'b', 'c', 'd', 'e'].map((id) => choice(id, 'budget.test.01')) });
    expect(rules(run({ items: [five] }))).toContain('schema');
  });
  it('lets events have 1 to 4 choices', () => {
    const ev = {
      id: 'event.test.01',
      pillar: 'save_manage',
      concept: 'surprise',
      personas: ['sana'],
      levels: ['starter'],
      weight: 1,
      text: 't:event.test.01.story',
      choices: [choice('a', 'event.test.01')],
      meta,
    };
    const en = { 'event.test.01.story': 'Rain.', 'event.test.01.a.label': 'OK', 'event.test.01.a.lesson': 'Fine.' };
    expect(run({ items: [ev], file: 'events/events.json', en })).toEqual([]);
  });
  it('flags duplicate ids across files', () => {
    const issues = run({
      files: [
        { path: 'scenarios/plan_budget.json', data: [scenario()] },
        { path: 'scenarios/save_manage.json', data: [scenario({ pillar: 'save_manage' })] },
      ],
    });
    expect(rules(issues)).toEqual(['duplicate_id']);
  });
  it('flags a file that is not an array', () => {
    expect(rules(run({ files: [{ path: 'scenarios/plan_budget.json', data: scenario() }] }))).toContain('schema');
  });
});

describe('rule 2: every key exists in en and hi', () => {
  it('flags a key missing in Hindi as an error', () => {
    const { 'budget.test.01.a.lesson': _drop, ...hi } = baseTexts();
    const issues = run({ hi });
    expect(rules(issues, 'error')).toEqual(['missing_key']);
    expect(issues[0]?.message).toContain('hi');
  });
  it('flags a key missing in English', () => {
    const { 'budget.test.01.story': _drop, ...en } = baseTexts();
    expect(rules(run({ en, hi: baseTexts() }), 'error')).toEqual(['missing_key']);
  });
  it('flags a missing Hindi file', () => {
    expect(rules(run({ hi: null }), 'error')).toContain('missing_language');
  });
  it('requires other languages to be complete', () => {
    expect(rules(run({ extra: { ur: { 'budget.test.01.story': 'x' } } }), 'error')).toContain('missing_key');
  });
  it('only warns for an incomplete machine_draft language', () => {
    const issues = run({ extra: { te: { _meta: { status: 'machine_draft' }, 'budget.test.01.story': 'x' } } });
    expect(rules(issues, 'error')).toEqual([]);
    expect(rules(issues, 'warning')).toContain('missing_key');
  });
});

describe('rule 3: educate, never recommend', () => {
  it('flags real brands in any language, case-insensitive', () => {
    const hi = { ...baseTexts(), 'budget.test.01.story': 'पैसे PhonePe से भेजो।' };
    const issues = run({ en: { ...baseTexts(), 'budget.test.01.story': 'Pay with GPAY today.' }, hi });
    expect(issues.filter((i) => i.rule === 'real_brand').map((i) => i.message.split(' ')[0])).toEqual([
      'en:budget.test.01.story',
      'hi:budget.test.01.story',
    ]);
  });
  it('matches whole words only', () => {
    expect(run({ en: { ...baseTexts(), 'budget.test.01.story': 'Credit is a loan. Public and classic.' } })).toEqual(
      [],
    );
  });
  it('flags promise words and imperative advice', () => {
    for (const text of [
      'Returns are guaranteed.',
      'This is risk-free.',
      'You should invest now.',
      'Sure returns await.',
    ]) {
      expect(rules(run({ en: { ...baseTexts(), 'budget.test.01.story': text } }), 'error')).toContain('promise');
    }
  });
  it('flags a Hindi promise word', () => {
    const hi = { ...baseTexts(), 'budget.test.01.story': 'इसमें पक्का मुनाफ़ा मिलेगा।' };
    expect(rules(run({ hi }), 'error')).toContain('promise');
  });
});

describe('rule 4: investing text names only fictional assets', () => {
  it.each(['a mutual fund', 'the stock market', 'a SIP', 'an FD', 'share market', 'stocks'])('flags %s', (term) => {
    const issues = run({ items: [investing()], en: investingTexts(`Try ${term} someday.`) });
    expect(rules(issues, 'error').some((r) => r === 'real_brand' || r === 'real_product')).toBe(true);
  });
  it('allows the fictional assets', () => {
    const story = 'Steady Deposit, Mixed Basket and Rocket Co are made-up options.';
    expect(run({ items: [investing()], en: investingTexts(story) })).toEqual([]);
  });
  it('does not apply to other pillars', () => {
    expect(run({ en: { ...baseTexts(), 'budget.test.01.story': 'A stock of rice.' } })).toEqual([]);
  });
});

describe('rule 5: assumption flag and ranges', () => {
  it('needs assumption: true on investing scenarios', () => {
    const issues = run({ items: [investing({ assumption: undefined })], en: investingTexts('Made-up growth.') });
    expect(rules(issues, 'error')).toEqual(['assumption_banner']);
  });
  it('flags a single percentage in investing text', () => {
    const issues = run({ items: [investing()], en: investingTexts('Steady Deposit might grow 8% a year.') });
    expect(rules(issues, 'error')).toEqual(['single_number']);
  });
  it('allows a range of percentages', () => {
    expect(run({ items: [investing()], en: investingTexts('It might grow 4% to 12% a year.') })).toEqual([]);
  });
});

describe('rule 6: links and numbers', () => {
  it('allows cybercrime.gov.in and 1930', () => {
    const story = 'Report it at cybercrime.gov.in or call 1930.';
    expect(run({ en: { ...baseTexts(), 'budget.test.01.story': story } })).toEqual([]);
  });
  it('flags other links and phone numbers', () => {
    const issues = run({
      en: { ...baseTexts(), 'budget.test.01.story': 'Visit www.winbig.com or call 9876543210 now.' },
    });
    expect(rules(issues, 'error').sort()).toEqual(['link', 'phone']);
  });
  describe('scam messages', () => {
    const scam = (text: string) => ({
      id: 'scam.test.01',
      channel: 'sms',
      levels: ['starter'],
      sender: 't:scam.test.01.sender',
      segments: [{ text: 't:scam.test.01.s1', suspicious: 't:scam.why.link' }],
      verdict: 'scam',
      explanation: 't:scam.test.01.why',
      meta,
      _text: text,
    });
    const texts = (s1: string) => ({
      'scam.test.01.sender': 'Unknown',
      'scam.test.01.s1': s1,
      'scam.why.link': 'Strange link',
      'scam.test.01.why': 'Scammers copy real names.',
    });
    const item = (s1: string) => {
      const { _text: _t, ...rest } = scam(s1);
      return rest;
    };
    it('may show links, numbers and promises on purpose', () => {
      const s1 = 'Guaranteed prize! Click http://win.example/x or call 9876543210.';
      expect(run({ items: [item(s1)], file: 'minigames/scam-or-safe.json', en: texts(s1) })).toEqual([]);
    });
    it('still may not name real brands', () => {
      const s1 = 'Your HDFC account is blocked.';
      const issues = run({ items: [item(s1)], file: 'minigames/scam-or-safe.json', en: texts(s1) });
      expect(rules(issues, 'error')).toEqual(['real_brand']);
    });
  });
});

describe('rule 7: length caps and tone', () => {
  it.each([
    ['story', 'budget.test.01.story', 221],
    ['label', 'budget.test.01.a.label', 41],
    ['lesson', 'budget.test.01.a.lesson', 141],
  ])('flags a %s over the cap', (_name, key, length) => {
    const issues = run({ en: { ...baseTexts(), [key]: 'x'.repeat(length) } });
    expect(rules(issues, 'error')).toEqual(['length']);
  });
  it('accepts text exactly at the cap', () => {
    expect(run({ en: { ...baseTexts(), 'budget.test.01.story': 'x'.repeat(220) } })).toEqual([]);
  });
  it('caps delayed notes', () => {
    const withLater = scenario({
      choices: [
        {
          ...choice('a', 'budget.test.01'),
          delayed: [{ afterWeeks: 2, effects: {}, note: 't:budget.test.01.a.later' }],
        },
        choice('b', 'budget.test.01'),
      ],
    });
    const en = { ...baseTexts(), 'budget.test.01.a.later': 'y'.repeat(141) };
    expect(rules(run({ items: [withLater], en }), 'error')).toEqual(['length']);
  });
  it('only measures English text', () => {
    expect(run({ hi: { ...baseTexts(), 'budget.test.01.story': 'x'.repeat(400) } })).toEqual([]);
  });
  it('warns, but does not fail, on shaming words', () => {
    const issues = run({ en: { ...baseTexts(), 'budget.test.01.story': 'Only lazy people skip saving.' } });
    expect(rules(issues, 'error')).toEqual([]);
    expect(rules(issues, 'warning')).toEqual(['tone']);
  });
});

describe('rule 8: strict mode', () => {
  const draft = scenario({ meta: { status: 'draft', author: 'claude' } });
  it('ignores drafts without strict', () => {
    expect(run({ items: [draft] })).toEqual([]);
  });
  it('fails on drafts with strict', () => {
    expect(rules(run({ items: [draft], strict: true }), 'error')).toEqual(['draft']);
  });
  it('passes reviewed items with strict', () => {
    expect(run({ strict: true })).toEqual([]);
  });
});

describe('the real content', () => {
  const jsonIn = (dir: string) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => `${dir}/${f}`);
  const files: ContentFile[] = [
    ...['scenarios', 'events', 'quizzes', 'minigames'].flatMap(jsonIn),
    'personas.json',
  ].map((path) => ({ path, data: readJson(path) }));
  const i18n: Record<string, Record<string, unknown>> = {};
  for (const path of jsonIn('i18n')) i18n[basename(path, '.json')] = readJson(path) as Record<string, unknown>;

  it('has no errors in a normal run', () => {
    const issues = validateContent({ files, i18n, guardrails }, { strict: false });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('fails strict only because every item is still a draft', () => {
    const issues = validateContent({ files, i18n, guardrails }, { strict: true });
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(new Set(errors.map((e) => e.rule))).toEqual(new Set(['draft']));
  });
});
