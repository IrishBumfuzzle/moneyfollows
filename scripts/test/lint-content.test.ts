import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  capFor,
  findLinks,
  hostAllowed,
  isValidContentVersion,
  linkHost,
  validateContent,
  type ContentFile,
  type Guardrails,
  type Issue,
} from '../../packages/content/src/validate';

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
  location: 'home',
  channel: 'in_person',
  speaker: 't:speaker.you',
  personas: ['sana'],
  difficulty: 1,
  text: 't:budget.test.01.story',
  choices: [choice('a', 'budget.test.01'), choice('b', 'budget.test.01')],
  meta,
  ...over,
});
const baseTexts = (key = 'budget.test.01') => ({
  'speaker.you': 'You',
  [`${key}.story`]: 'Payday is here.',
  [`${key}.a.label`]: 'Save first',
  [`${key}.a.lesson`]: 'Saving first makes it happen.',
  [`${key}.b.label`]: 'Spend first',
  [`${key}.b.lesson`]: 'Spending first leaves less.',
});

function run(opts: {
  required?: string[];
  version?: string;
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
      requiredLanguages: opts.required,
      contentVersion: opts.version,
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
      location: 'hospital',
      channel: 'in_person',
      speaker: 't:speaker.doctor',
      personas: ['sana'],
      levels: ['starter'],
      weight: 1,
      text: 't:event.test.01.story',
      choices: [choice('a', 'event.test.01')],
      meta,
    };
    const en = {
      'speaker.doctor': 'Doctor',
      'event.test.01.story': 'Rain.',
      'event.test.01.a.label': 'OK',
      'event.test.01.a.lesson': 'Fine.',
    };
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
  it('flags the old classroom distractor "splitting doubles the money" in Hindi', () => {
    const hi = { ...baseTexts(), 'budget.test.01.story': 'बाँटने से पैसा दोगुना होता है' };
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
    const scamRun = (s1: string, over: Record<string, string> = {}) =>
      run({ items: [item(s1)], file: 'minigames/scam-or-safe.json', en: { ...texts(s1), ...over } });
    it('may quote promises and use reserved fake links and placeholder numbers in the message body', () => {
      expect(scamRun('Guaranteed prize! Click http://win.example/x or kyc.invalid now, or call 00000 00000.')).toEqual(
        [],
      );
    });
    it.each([
      ['a real-looking link', 'Claim at win-big.shop/claim today.', 'link'],
      ['a messaging link', 'Chat now: wa.me/123', 'link'],
      ['a look-alike of the allowed site', 'Report at cybercrime.gov.in.evil.com', 'link'],
      ['a real-looking phone number', 'Call 98765 43210 to claim.', 'phone'],
    ])('flags %s in the message body', (_name, s1, rule) => {
      expect(rules(scamRun(s1), 'error')).toContain(rule);
    });
    it('gives the explanation, hint and sender the full checks', () => {
      const ok = 'Fake prize.';
      expect(rules(scamRun(ok, { 'scam.test.01.why': 'This one is guaranteed to pay.' }), 'error')).toEqual([
        'promise',
      ]);
      expect(rules(scamRun(ok, { 'scam.why.link': 'Visit prize.example to check.' }), 'error')).toEqual(['link']);
      expect(rules(scamRun(ok, { 'scam.test.01.sender': '+91 98765 43210' }), 'error')).toEqual(['phone']);
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
  it('measures every language, in visible characters', () => {
    const issues = run({ hi: { ...baseTexts(), 'budget.test.01.story': 'क'.repeat(221) } });
    expect(issues.map((i) => `${i.rule} ${i.message.split(' ')[0]}`)).toEqual(['length hi:budget.test.01.story']);
    // A letter with its vowel sign is one visible character: 110 x "कि" is 220, at the cap.
    expect(run({ hi: { ...baseTexts(), 'budget.test.01.story': 'कि'.repeat(110) } })).toEqual([]);
  });
  it('caps keys beyond story, label and lesson', () => {
    expect(capFor('quiz.x.baseline.why')).toBe('explanation');
    expect(capFor('quiz.x.baseline.q')).toBe('question');
    expect(capFor('quiz.x.baseline.o3')).toBe('option');
    expect(capFor('scam.x.01.s2')).toBe('segment');
    expect(capFor('scam.why.link')).toBe('hint');
    expect(capFor('persona.sana.bio')).toBe('bio');
    expect(capFor('budget.x.01.b.later2')).toBe('note');
    expect(capFor('reflection.save_first')).toBe('reflection');
    for (const cap of ['explanation', 'question', 'option', 'segment', 'hint', 'bio', 'sender', 'name', 'goal'])
      expect(guardrails.lengthCaps[cap], cap).toBeGreaterThan(0);
    const later2 = scenario({
      choices: [
        {
          ...choice('a', 'budget.test.01'),
          delayed: [{ afterWeeks: 2, effects: {}, note: 't:budget.test.01.a.later2' }],
        },
        choice('b', 'budget.test.01'),
      ],
    });
    const en = { ...baseTexts(), 'budget.test.01.a.later2': 'y'.repeat(141) };
    expect(rules(run({ items: [later2], en }), 'error')).toEqual(['length']);
  });
  it('checks strings no card uses, like reflections', () => {
    const en = { ...baseTexts(), 'reflection.save_first': 'Open an SBI account and call 9876543210.' };
    expect(rules(run({ en }), 'error').sort()).toEqual(['phone', 'real_brand']);
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

const story = (text: string) => run({ en: { ...baseTexts(), 'budget.test.01.story': text } });
const hiStory = (text: string) => run({ hi: { ...baseTexts(), 'budget.test.01.story': text } });
const investingStory = (text: string) => run({ items: [investing()], en: investingTexts(text) });

describe('rule 3: tricks that hide a brand or term', () => {
  it.each([
    ['a zero-width space', 'Pay\u200btm'],
    ['a word joiner and a soft hyphen', 'Pay\u2060t\u00adm'],
    ['full-width letters', '\uff30aytm'],
    ['a hyphen', 'G-Pay'],
    ['a space', 'G Pay'],
    ['dots', 'S.B.I.'],
    ['a hyphen in a joined name', 'Phone-Pe'],
    ['a hyphenated generic product', 'mutual-fund'],
    ['a space inside a long name', 'Pay tm'],
  ])('catches %s (%s)', (_name, brand) => {
    expect(rules(story(`Send it with ${brand} today.`), 'error')).toContain('real_brand');
  });
  it.each(['पेटीएम', 'एसबीआई', 'फोनपे', 'फ़ोनपे', 'गूगल पे', 'म्यूचुअल फंड', 'म्यूचुअल फ़ंड'])(
    'catches the Devanagari form %s',
    (brand) => {
      expect(rules(hiStory(`पैसे ${brand} से भेजें।`), 'error')).toContain('real_brand');
    },
  );
  it('does not flag ordinary words that contain a short term', () => {
    for (const text of [
      'Credit is a loan. Public and classic.',
      'Keep your phone. People may call.',
      'A simple plan: cash every week, e.g. ₹50.',
      'Be reliable and publicly kind.',
      'Gossip about sipping tea.',
    ])
      expect(story(text), text).toEqual([]);
    expect(hiStory('फ़ोन पर बात करें और दोस्त के साथ शेयर करें।')).toEqual([]);
  });
  it('catches promises written with tricks too', () => {
    expect(rules(story('This is risk\u200b-free.'), 'error')).toContain('promise');
    expect(rules(story('GUARANTEED!'), 'error')).toContain('promise');
  });
});

describe('rule 3: imperative investment advice', () => {
  it.each([
    'You should put money in Rocket Co now.',
    'Invest now in Rocket Co.',
    'Buy Rocket Co today.',
    'You must buy shares this week.',
    'Put your money in Mixed Basket.',
    'Invest today!',
  ])('flags "%s"', (text) => {
    expect(rules(story(text), 'error')).toContain('advice');
  });
  it.each(['Rocket Co में अभी निवेश करें।', 'आपको ज़रूर Rocket Co ख़रीदना चाहिए।', 'Mixed Basket ज़रूर ख़रीदें।'])(
    'flags the Hindi "%s"',
    (text) => {
      expect(rules(hiStory(text), 'error')).toContain('advice');
    },
  );
  it('allows explaining, choosing and negated advice', () => {
    for (const text of [
      'Rocket Co could jump or drop. Nobody knows.',
      'Put ₹300 in Steady Deposit',
      'Buy the monthly pass.',
      'You should never put all your money in one place like Rocket Co.',
      'Rocket Co will DOUBLE! Put in ₹300 now.',
    ])
      expect(story(text), text).toEqual([]);
    expect(hiStory('मासिक पास ख़रीदें।')).toEqual([]);
  });
});

describe('rule 5: single numbers on investing cards', () => {
  it.each([
    ['a percent word', 'Steady Deposit might grow 6 percent a year.'],
    ['a Hindi percent word', 'Steady Deposit 6 प्रतिशत बढ़ सकता है।'],
    ['a single ₹ outcome', 'Steady Deposit could grow to ₹500 by next year.'],
    ['a single ₹ outcome with "about"', 'Your ₹100 will become about ₹200.'],
    ['a single Hindi ₹ outcome', 'यह लगभग ₹500 हो सकता है।'],
    ['a single placeholder', 'It could end near ₹{{avg}}.'],
  ])('flags %s', (_name, text) => {
    expect(rules(investingStory(text), 'error')).toEqual(['single_number']);
  });
  it.each([
    'It could grow to ₹400 to ₹600.',
    'It could end near ₹{{low}}, ₹{{avg}} or ₹{{high}}.',
    'यह ₹400 से ₹600 हो सकता है।',
    '₹500 a month might grow more over the years.',
    'In this story, ₹300 became about ₹302.',
    'It might grow 4 percent to 8 percent a year.',
  ])('allows "%s"', (text) => {
    expect(investingStory(text)).toEqual([]);
  });
});

describe('rule 6: links', () => {
  it.each([
    'cybercrime.gov.in',
    'https://cybercrime.gov.in/report',
    'www.cybercrime.gov.in',
    'https://www.cybercrime.gov.in.',
  ])('allows %s', (link) => {
    expect(story(`Report it at ${link} or call 1930.`)).toEqual([]);
  });
  it.each([
    'cybercrime.gov.in.evil.com',
    'fakecybercrime.gov.in',
    'evil.com/cybercrime.gov.in',
    'https://evil.com/?next=cybercrime.gov.in',
    'wa.me/1234',
    'deals.shop',
    'free-gift.site/claim',
    'bit.ly/x',
    'cybercrime\uff0egov\uff0ein\uff0eevil\uff0ecom',
  ])('flags %s', (link) => {
    expect(rules(story(`Report it at ${link} now.`), 'error')).toContain('link');
  });
  it('parses hosts and needs an exact or subdomain match', () => {
    expect(linkHost('HTTPS://user@Www.CyberCrime.gov.in:443/a?b')).toBe('www.cybercrime.gov.in');
    expect(hostAllowed('www.cybercrime.gov.in', ['cybercrime.gov.in'])).toBe(true);
    expect(hostAllowed('cybercrime.gov.in.evil.com', ['cybercrime.gov.in'])).toBe(false);
    expect(hostAllowed('fakecybercrime.gov.in', ['cybercrime.gov.in'])).toBe(false);
    expect(findLinks('Use e.g. ₹50, i.e. a little. Rocket Co. It is ₹1,400.')).toEqual([]);
  });
});

describe('rule 6: phone numbers', () => {
  it.each([
    '98765 43210',
    '09876543210',
    '+91 98765 43210',
    '+919876543210',
    '040-2345-6789',
    '(040) 2345 6789',
    '९८७६५ ४३२१०',
    '1800 123 4567',
  ])('flags %s', (num) => {
    expect(rules(story(`Call ${num} for help.`), 'error')).toEqual(['phone']);
  });
  it('allows 1930 in any digit script, amounts and OTP codes', () => {
    expect(story('Call 1930 or १९३० now.')).toEqual([]);
    expect(story('You won ₹10,00,000! Your OTP is 482913. ₹1,400 is due.')).toEqual([]);
  });
});

describe('rule 7: placeholders', () => {
  it('needs the same {{placeholders}} in every language', () => {
    const en = { ...baseTexts(), 'budget.test.01.story': 'It could be ₹{{low}} to ₹{{high}}.' };
    const hi = { ...baseTexts(), 'budget.test.01.story': 'यह ₹{{low}} हो सकता है।' };
    expect(rules(run({ en, hi }), 'error')).toEqual(['placeholders']);
    expect(run({ en, hi: en })).toEqual([]);
  });
});

describe('cards that can never play out', () => {
  it('flags a requiresFlag that no choice sets', () => {
    expect(rules(run({ items: [scenario({ requiresFlag: 'never_set' })] }), 'error')).toEqual(['requires_flag']);
  });
  it('accepts a requiresFlag set by another card, now or after a delay', () => {
    const setter = scenario({
      id: 'budget.setter.01',
      choices: [
        { ...choice('a', 'budget.test.01'), effects: { flags: ['now_flag'] } },
        {
          ...choice('b', 'budget.test.01'),
          delayed: [{ afterWeeks: 2, effects: { flags: ['later_flag'] }, note: 't:budget.test.01.a.lesson' }],
        },
      ],
    });
    const a = scenario({ id: 'budget.gated.01', requiresFlag: 'now_flag' });
    const b = scenario({ id: 'budget.gated.02', requiresFlag: 'later_flag' });
    expect(run({ items: [setter, a, b] })).toEqual([]);
  });
  it('flags a delay that lands after the 12-week game', () => {
    const late = scenario({
      choices: [
        {
          ...choice('a', 'budget.test.01'),
          delayed: [{ afterWeeks: 12, effects: {}, note: 't:budget.test.01.a.lesson' }],
        },
        choice('b', 'budget.test.01'),
      ],
    });
    expect(rules(run({ items: [late] }), 'error')).toContain('delay');
  });
  it('flags a card that targets only personas the game does not ship', () => {
    const files = [
      { path: 'scenarios/plan_budget.json', data: [scenario({ personas: ['kiran'] })] },
      { path: 'personas.json', data: readJson('personas.json') },
    ];
    const real = readJson('i18n/en.json') as Record<string, string>;
    const en = {
      ...baseTexts(),
      ...Object.fromEntries(Object.entries(real).filter(([k]) => k.startsWith('persona.'))),
    };
    expect(rules(run({ files, en }), 'error')).toEqual(['no_persona']);
  });
});

describe('languages are data', () => {
  it('uses the required list it is given', () => {
    expect(rules(run({ hi: null, required: ['en'] }), 'error')).toEqual([]);
    expect(rules(run({ required: ['en', 'hi', 'te'] }), 'error')).toEqual(['missing_language']);
  });
  it('treats a complete new language file like any other', () => {
    expect(run({ extra: { te: baseTexts() } })).toEqual([]);
  });
});

describe('content version', () => {
  it.each(['2026.10.10', '2026.10.10.2', '2026-10-10', '1.2.3', '0.1.0-beta.1'])('accepts %s', (v) => {
    expect(isValidContentVersion(v)).toBe(true);
    expect(run({ version: v })).toEqual([]);
  });
  it.each(['', 'v1', '1.2', '2026.13.01', '2026.02.30', '2026.1.01', 'latest', '01.2.3'])('rejects "%s"', (v) => {
    expect(isValidContentVersion(v)).toBe(false);
    expect(rules(run({ version: v }), 'error')).toEqual(['version']);
  });
});

describe('the real content', () => {
  const jsonIn = (dir: string) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => `${dir}/${f}`);
  const files: ContentFile[] = [
    ...['scenarios', 'events', 'quizzes', 'minigames', 'rewards', 'news'].flatMap(jsonIn),
    'personas.json',
    'places.json',
    'glossary.json',
  ].map((path) => ({ path, data: readJson(path) }));
  const i18n: Record<string, Record<string, unknown>> = {};
  for (const path of jsonIn('i18n')) i18n[basename(path, '.json')] = readJson(path) as Record<string, unknown>;

  const manifest = readJson('manifest.json') as { version: string; required: string[] };
  const input = { files, i18n, guardrails, requiredLanguages: manifest.required, contentVersion: manifest.version };

  it('has no errors in a normal run', () => {
    const issues = validateContent(input, { strict: false });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('reads places, the glossary and every news edition', () => {
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['places.json', 'glossary.json', 'news/2026-W41.json']),
    );
  });
  it('fails strict only because items are drafts and articles are not fact-checked yet', () => {
    const issues = validateContent(input, { strict: true });
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(new Set(errors.map((e) => e.rule))).toEqual(new Set(['draft', 'facts_unchecked']));
  });
});

describe('badges (rewards/badges.json)', () => {
  const badgeItem = (over: Record<string, unknown> = {}) => ({
    id: 'first_step',
    name: 't:badge.first_step.name',
    description: 't:badge.first_step.desc',
    icon: 'footprints',
    xp: 10,
    rule: { kind: 'decisions', n: 1 },
    meta,
    ...over,
  });
  const badgeTexts = {
    'badge.first_step.name': 'First Step',
    'badge.first_step.desc': 'You made your first money choice.',
  };
  const runBadge = (item: unknown, en: Record<string, unknown> = badgeTexts, strict = false) =>
    run({ items: [item], file: 'rewards/badges.json', en, strict });

  it('accepts a valid badge', () => {
    expect(runBadge(badgeItem())).toEqual([]);
  });

  it('rejects an unknown rule kind and a negative XP', () => {
    expect(rules(runBadge(badgeItem({ rule: { kind: 'magic' } })))).toContain('schema');
    expect(rules(runBadge(badgeItem({ xp: -5 })))).toContain('schema');
  });

  it('needs its strings in en and hi, within the badge caps', () => {
    expect(rules(run({ items: [badgeItem()], file: 'rewards/badges.json', en: badgeTexts, hi: {} }))).toContain(
      'missing_key',
    );
    expect(capFor('badge.first_step.name')).toBe('badgeName');
    expect(capFor('badge.first_step.desc')).toBe('badgeDesc');
    const long = { ...badgeTexts, 'badge.first_step.name': 'A badge name that is far too long' };
    expect(rules(runBadge(badgeItem(), long))).toContain('length');
  });

  it('applies the brand guardrail and strict draft rule to badges too', () => {
    const brand = { ...badgeTexts, 'badge.first_step.desc': 'You paid with Paytm.' };
    expect(rules(runBadge(badgeItem(), brand))).toContain('real_brand');
    expect(rules(runBadge(badgeItem({ meta: { status: 'draft', author: 'x' } }), badgeTexts, true))).toContain('draft');
  });
});

describe('Jar Splitter (minigames/jar-splitter.json)', () => {
  const round = (over: Record<string, unknown> = {}) => ({
    id: 'jar.test.01',
    personas: ['sana'],
    levels: ['starter'],
    text: 't:jar.test.01.story',
    lesson: 't:jar.test.01.lesson',
    income: 4000,
    step: 100,
    checks: [
      {
        id: 'needs',
        kind: 'min_jar',
        jar: 'needs',
        amount: 2000,
        ok: 't:jar.check.needs.ok',
        fix: 't:jar.check.needs.fix',
      },
    ],
    meta,
    ...over,
  });
  const texts = {
    'jar.test.01.story': 'Payday! Split ₹4,000 into your jars.',
    'jar.test.01.lesson': 'Bills first, then savings.',
    'jar.check.needs.ok': 'Needs has ₹{{amount}}.',
    'jar.check.needs.fix': 'Needs is ₹{{short}} short.',
  };
  const runJar = (item: unknown, en: Record<string, unknown> = texts, hi?: Record<string, unknown>) =>
    run({ items: [item], file: 'minigames/jar-splitter.json', en, hi });

  it('accepts a valid round and is not read as a Scam or Safe? message', () => {
    expect(runJar(round())).toEqual([]);
  });

  it('rejects a step that does not divide the income and a bill bigger than the income', () => {
    expect(rules(runJar(round({ step: 300 })))).toContain('schema');
    const big = round({
      checks: [
        {
          id: 'needs',
          kind: 'min_jar',
          jar: 'needs',
          amount: 9000,
          ok: 't:jar.check.needs.ok',
          fix: 't:jar.check.needs.fix',
        },
      ],
    });
    expect(rules(runJar(big))).toContain('schema');
  });

  it('needs matching placeholders in hi and keeps feedback within its cap', () => {
    const hi = { ...texts, 'jar.check.needs.fix': 'ज़रूरतों में पैसे कम हैं।' };
    expect(rules(runJar(round(), texts, hi))).toContain('placeholders');
    expect(capFor('jar.check.needs.ok')).toBe('feedback');
    const long = { ...texts, 'jar.check.needs.ok': 'x'.repeat(121) };
    expect(rules(runJar(round(), long))).toContain('length');
  });
});

// ---- Paisa Times and the map (CLAUDE.md 5.8, 7.2) ------------------------------------------

const place = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `t:place.${id}`,
  ...(id.includes('.') ? { parent: id.split('.')[0] } : {}),
  position: { x: 50, y: 50 },
  ...over,
});
const placesFixture = () => [
  place('home'),
  place('convenience', { children: ['convenience.kirana'] }),
  place('convenience.kirana'),
];
const placeTexts = { 'place.home': 'Home', 'place.convenience': 'Shop', 'place.convenience.kirana': 'Kirana store' };

const term = (id: string) => ({
  id,
  word: `t:glossary.${id}.word`,
  simple: `t:glossary.${id}.simple`,
  example: `t:glossary.${id}.example`,
});
const termTexts = (id: string, word: string) => ({
  [`glossary.${id}.word`]: word,
  [`glossary.${id}.simple`]: `A short meaning of ${word}.`,
  [`glossary.${id}.example`]: `An everyday example of ${word}.`,
});
const glossaryTexts = { ...termTexts('upi', 'UPI'), ...termTexts('otp', 'OTP') };

const capOf = (name: string): number => guardrails.lengthCaps[name] ?? 0;
const ART = 'news.2026-W41.test_article';
const article = (over: Record<string, unknown> = {}) => ({
  id: 'test_article',
  edition: '2026-W41',
  headline: `t:${ART}.headline`,
  body: `t:${ART}.body`,
  terms: ['upi', 'otp'],
  question: {
    prompt: `t:${ART}.q`,
    options: [`t:${ART}.o1`, `t:${ART}.o2`, `t:${ART}.o3`],
    correct: 1,
    explanation: `t:${ART}.why`,
  },
  reward: { wage: 60, xp: 12 },
  meta: { status: 'reviewed', author: 'test', factsCheckedBy: 'teacher' },
  ...over,
});
const articleTexts = (body = 'Paying by [[upi]] is quick. Never share an [[otp]] with a caller.') => ({
  [`${ART}.headline`]: 'Codes are secrets',
  [`${ART}.body`]: body,
  [`${ART}.q`]: 'Who may see your OTP?',
  [`${ART}.o1`]: 'A caller from the bank',
  [`${ART}.o2`]: 'Nobody but you',
  [`${ART}.o3`]: 'A friend',
  [`${ART}.why`]: 'An OTP proves it is you, so it stays with you.',
});
const ptTexts = (over: Record<string, string> = {}) => ({
  ...baseTexts(),
  ...placeTexts,
  ...glossaryTexts,
  ...articleTexts(),
  ...over,
});

function runPT(
  opts: {
    cards?: unknown[];
    places?: unknown[];
    glossary?: unknown[];
    news?: unknown[];
    en?: Record<string, string>;
    hi?: Record<string, string>;
    strict?: boolean;
  } = {},
): Issue[] {
  const en = ptTexts(opts.en);
  return run({
    files: [
      {
        path: 'scenarios/plan_budget.json',
        data: opts.cards ?? [scenario({ location: 'convenience', sublocation: 'convenience.kirana' })],
      },
      { path: 'places.json', data: opts.places ?? placesFixture() },
      { path: 'glossary.json', data: opts.glossary ?? [term('upi'), term('otp')] },
      { path: 'news/2026-W41.json', data: opts.news ?? [article()] },
    ],
    en,
    hi: { ...en, ...opts.hi },
    strict: opts.strict,
  });
}

describe('Paisa Times and map files are read', () => {
  it('accepts valid places, glossary and an article', () => {
    expect(runPT()).toEqual([]);
  });
  it('validates places.json, glossary.json and news/*.json with their schemas', () => {
    expect(
      rules(
        runPT({
          places: [...placesFixture(), place('bank', { position: { x: 150, y: 0 } })],
          en: { 'place.bank': 'Bank' },
        }),
      ),
    ).toEqual(['schema']);
    expect(rules(runPT({ glossary: [term('upi'), { ...term('otp'), word: 'OTP' }] }))).toEqual(['schema']);
    expect(rules(runPT({ news: [article({ question: { ...article().question, correct: 3 } })] }))).toEqual(['schema']);
  });
  it('keeps ids per file kind and article ids per edition', () => {
    const otherEdition = article({ edition: '2026-W42' });
    expect(runPT({ news: [article(), otherEdition] })).toEqual([]);
    expect(rules(runPT({ news: [article(), article()] }))).toEqual(['duplicate_id']);
  });
});

describe('rule 1: places.json holds every card location and sublocation', () => {
  it('accepts a card at a top-level place and one of its sub-map locations', () => {
    expect(runPT({ cards: [scenario({ location: 'home' })] })).toEqual([]);
    expect(runPT()).toEqual([]);
  });
  it('flags a location missing from places.json', () => {
    expect(rules(runPT({ cards: [scenario({ location: 'bank' })] }))).toEqual(['unknown_location']);
  });
  it('flags a sublocation that is not a child of its location', () => {
    const tailor = scenario({ location: 'convenience', sublocation: 'convenience.tailor' });
    expect(rules(runPT({ cards: [tailor] }))).toEqual(['unknown_sublocation']);
  });
  it('flags a sub-map location its parent does not list', () => {
    const places = [place('home'), place('convenience'), place('convenience.kirana')];
    expect(rules(runPT({ places }))).toEqual(['place_tree', 'unknown_sublocation']);
  });
  it('skips the map checks when places.json is not linted', () => {
    expect(run({ items: [scenario({ location: 'bank' })] })).toEqual([]);
  });
});

describe('rule 1: [[termId]] markers', () => {
  it('accepts markers that are in the glossary, match terms, and match in every language', () => {
    const hi = { [`${ART}.body`]: '[[upi]] से पैसे भेजना आसान है। कॉल करने वाले को [[otp]] कभी न बताएँ।' };
    expect(runPT({ hi })).toEqual([]);
  });
  it('flags a marker that is not in the glossary', () => {
    const en = articleTexts('Paying by [[upi]] is quick. A [[pin]] is secret. Never share an [[otp]].');
    expect(rules(runPT({ en, news: [article({ terms: ['upi', 'pin', 'otp'] })] }))).toEqual(['unknown_term']);
  });
  it('flags terms that differ from the markers in the en body', () => {
    expect(rules(runPT({ news: [article({ terms: ['upi'] })] }))).toEqual(['article_terms']);
  });
  it('flags a language whose body marks different terms', () => {
    const hi = { [`${ART}.body`]: '[[upi]] से पैसे भेजना आसान है। OTP कभी न बताएँ।' };
    const issues = runPT({ hi });
    expect(issues.map((i) => `${i.rule} ${i.message.split(' ')[0]}`)).toEqual([`term_markers hi:${ART}.body`]);
  });
  it('flags a marker that is not written as [[lower_case_id]]', () => {
    const en = articleTexts('Paying by [[upi]] is quick. Never share an [[otp]] or a [[ PIN ]].');
    expect(rules(runPT({ en }))).toEqual(['term_marker']);
  });
});

describe('rule 7: Paisa Times length caps', () => {
  it('maps article, glossary and place keys to their caps', () => {
    expect(capFor('news.2026-W41.upi_fraud.headline')).toBe('headline');
    expect(capFor('news.2026-W41.upi_fraud.body')).toBe('articleBody');
    expect(capFor('news.2026-W41.upi_fraud.q')).toBe('question');
    expect(capFor('news.2026-W41.upi_fraud.o2')).toBe('option');
    expect(capFor('news.2026-W41.upi_fraud.why')).toBe('explanation');
    expect(capFor('glossary.inflation.word')).toBe('glossaryWord');
    expect(capFor('glossary.inflation.simple')).toBe('glossarySimple');
    expect(capFor('glossary.inflation.example')).toBe('glossaryExample');
    expect(capFor('place.convenience.phone_shop')).toBe('placeName');
    expect(guardrails.lengthCaps).toMatchObject({ articleBody: 600, glossarySimple: 100 });
  });
  it('accepts an article body at the cap, counting each marker as its word', () => {
    // Raw it is 608 characters; shown, "[[upi]]" is "UPI" and "[[otp]]" is "OTP": 3 + 1 + 590 + 1 + 3 + 2 = 600.
    const body = `[[upi]] ${'x'.repeat(590)} [[otp]]..`;
    expect(runPT({ en: articleTexts(body) })).toEqual([]);
  });
  it('flags text over each new cap', () => {
    const over = (key: string, n: number) => rules(runPT({ en: { [key]: 'x'.repeat(n) } }), 'error');
    expect(over(`${ART}.body`, 601)).toContain('length');
    expect(over(`${ART}.headline`, capOf('headline') + 1)).toEqual(['length']);
    expect(over('glossary.upi.simple', 101)).toEqual(['length']);
    expect(over('glossary.upi.word', capOf('glossaryWord') + 1)).toEqual(['length']);
    expect(over('glossary.upi.example', capOf('glossaryExample') + 1)).toEqual(['length']);
    expect(over('place.home', capOf('placeName') + 1)).toEqual(['length']);
    expect(over(`${ART}.why`, capOf('explanation') + 1)).toEqual(['length']);
  });
});

describe('rule 8: strict mode and fact checks', () => {
  it('passes a reviewed article that a human fact-checked', () => {
    expect(runPT({ strict: true })).toEqual([]);
  });
  it('fails an article with no factsCheckedBy', () => {
    const unchecked = article({ meta: { status: 'reviewed', author: 'test' } });
    expect(rules(runPT({ news: [unchecked], strict: true }))).toEqual(['facts_unchecked']);
    expect(runPT({ news: [unchecked] })).toEqual([]);
  });
  it('fails a draft article on both rules', () => {
    const draftArticle = article({ meta: { status: 'draft', author: 'claude' } });
    expect(rules(runPT({ news: [draftArticle], strict: true })).sort()).toEqual(['draft', 'facts_unchecked']);
  });
});

describe('rules 3 and 6: guardrails apply to articles, glossary and places', () => {
  it('allows the 1930 helpline and cybercrime.gov.in in an article', () => {
    const en = articleTexts('Lost money by [[upi]]? Call 1930 or report on cybercrime.gov.in. Never share an [[otp]].');
    expect(runPT({ en })).toEqual([]);
  });
  it('flags "invest now" advice and promises in an article', () => {
    const advice = articleTexts('Use [[upi]] and your [[otp]] wisely. Invest now in Rocket Co before it is too late.');
    expect(rules(runPT({ en: advice }))).toEqual(['advice']);
    const promise = articleTexts('[[upi]] savings plans give guaranteed returns. Keep your [[otp]] safe.');
    expect(rules(runPT({ en: promise }))).toEqual(['promise']);
  });
  it('flags a real brand, link or phone number in glossary and place text', () => {
    expect(rules(runPT({ en: { 'glossary.upi.example': 'Ammi pays with Paytm.' } }))).toEqual(['real_brand']);
    expect(rules(runPT({ en: { 'place.convenience.kirana': 'SBI corner' } }))).toEqual(['real_brand']);
    expect(rules(runPT({ en: { 'glossary.otp.example': 'Report it at otp-help.in.' } }))).toEqual(['link']);
    expect(rules(runPT({ en: { [`${ART}.why`]: 'Call 98765 43210 for help.' } }))).toEqual(['phone']);
  });
  it('flags Hindi advice in an article', () => {
    const hi = { [`${ART}.body`]: '[[upi]] और [[otp]] समझिए। आज ही Rocket Co में निवेश करें।' };
    expect(rules(runPT({ hi }))).toEqual(['advice']);
  });
});

describe('concepts and real-life guides', () => {
  const concept = {
    id: 'needs_first',
    pillar: 'plan_budget',
    name: 't:concept.needs_first.name',
    simple: 't:concept.needs_first.simple',
  };
  const conceptTexts = {
    'concept.needs_first.name': 'Needs first',
    'concept.needs_first.simple': 'Pay for needs before wants.',
  };
  const guide = (over: Record<string, unknown> = {}) => ({
    id: 'guide.test',
    pillar: 'plan_budget',
    icon: 'wallet',
    concepts: ['needs_first'],
    title: 't:guide.test.title',
    intro: 't:guide.test.intro',
    steps: ['t:guide.test.step1', 't:guide.test.step2'],
    check: {
      prompt: 't:guide.test.q',
      options: ['t:guide.test.o1', 't:guide.test.o2'],
      correct: 0,
      explanation: 't:guide.test.why',
    },
    meta,
    ...over,
  });
  const guideTexts = {
    'guide.test.title': 'A test guide',
    'guide.test.intro': 'Why this matters.',
    'guide.test.step1': 'First step.',
    'guide.test.step2': 'Second step.',
    'guide.test.q': 'Which comes first?',
    'guide.test.o1': 'Needs',
    'guide.test.o2': 'Wants',
    'guide.test.why': 'Needs come first.',
  };
  const lint = (opts: { guide?: unknown; scenarioConcept?: string; en?: Record<string, unknown>; strict?: boolean }) =>
    run({
      files: [
        { path: 'concepts.json', data: [concept] },
        { path: 'guides/real-life.json', data: [opts.guide ?? guide()] },
        { path: 'scenarios/plan_budget.json', data: [scenario({ concept: opts.scenarioConcept ?? 'needs_first' })] },
      ],
      en: opts.en ?? { ...baseTexts(), ...conceptTexts, ...guideTexts },
      strict: opts.strict,
    });

  it('passes a guide and a scenario whose concepts are in concepts.json', () => {
    expect(lint({})).toEqual([]);
  });
  it('flags a concept tag that is not in concepts.json, on scenarios and guides', () => {
    expect(rules(lint({ scenarioConcept: 'missing' }))).toEqual(['unknown_concept']);
    expect(rules(lint({ guide: guide({ concepts: ['needs_first', 'missing'] }) }))).toEqual(['unknown_concept']);
  });
  it('checks guide text like any other: missing keys, caps and guardrails', () => {
    const en = { ...baseTexts(), ...conceptTexts, ...guideTexts };
    expect(rules(lint({ en: { ...en, 'guide.test.step2': '' } }))).toContain('missing_key');
    expect(rules(lint({ en: { ...en, 'guide.test.step1': 'x'.repeat(161) } }))).toEqual(['length']);
    expect(rules(lint({ en: { ...en, 'guide.test.step1': 'Open an account with SBI.' } }))).toEqual(['real_brand']);
    expect(rules(lint({ en: { ...en, 'guide.test.step1': 'Report it at cybercrime.gov.in or call 1930.' } }))).toEqual(
      [],
    );
  });
  it('maps concept and guide keys to their caps', () => {
    expect(capFor('concept.kyc.name')).toBe('conceptName');
    expect(capFor('concept.kyc.simple')).toBe('glossarySimple');
    expect(capFor('guide.bank_account.title')).toBe('guideTitle');
    expect(capFor('guide.bank_account.intro')).toBe('guideStep');
    expect(capFor('guide.bank_account.step3')).toBe('guideStep');
    expect(capFor('guide.bank_account.q')).toBe('question');
  });
  it('strict mode needs factsCheckedBy on guides, like articles', () => {
    expect(rules(lint({ strict: true }))).toEqual(['facts_unchecked']);
    expect(lint({ strict: true, guide: guide({ meta: { ...meta, factsCheckedBy: 'NGO trainer' } }) })).toEqual([]);
  });
  it('rejects a guide whose check answer is out of range', () => {
    expect(rules(lint({ guide: guide({ check: { ...guide().check, correct: 5 } }) }))).toEqual(['schema']);
  });
});
