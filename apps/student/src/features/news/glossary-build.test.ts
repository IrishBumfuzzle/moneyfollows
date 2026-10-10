import { glossary, i18n } from '@paisa/content';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
// BE-1's forbidden-phrase lists, the same file pnpm lint:content uses (not exported by @paisa/content).
import guardrails from '../../../../../packages/content/guardrails.json';
import { getEdition } from './content';
import {
  BODY_CAP,
  DefineResponse,
  ExtractResponse,
  findPhrase,
  findTerm,
  forbiddenIn,
  formatJson,
  insertMarker,
  markArticle,
  mergeGlossary,
  normalise,
  validateEntry,
} from './glossary-build';
import type { NewEntry } from './glossary-build';
import type { GlossaryTerm } from './types';

const forbidden = [...guardrails.brands, ...guardrails.promises];
const en = (i18n as Partial<Record<string, Record<string, string>>>).en ?? {};

const entry = (over: Partial<NewEntry> = {}): NewEntry => ({
  id: 'moneylender',
  en: {
    word: 'moneylender',
    simple: 'A person who lends money and asks for extra back.',
    example: 'Ravi asks the moneylender near Charminar how much extra he must pay back.',
  },
  hi: {
    word: 'साहूकार',
    simple: 'जो पैसे उधार देता है और ऊपर से ज़्यादा वापस माँगता है।',
    example: 'रवि चारमीनार के पास वाले साहूकार से पूछता है कि कितना ज़्यादा लौटाना होगा।',
  },
  ...over,
});

describe('normalise and findTerm', () => {
  it('compares words trimmed, single-spaced, lower case and NFKC', () => {
    expect(normalise('  UPI   PIN ')).toBe('upi pin');
    expect(normalise('ＵＰＩ')).toBe('upi');
  });

  it('finds an entry by id or by its English word, in any case', () => {
    expect(findTerm(glossary, en, 'upi_pin')?.id).toBe('upi_pin');
    expect(findTerm(glossary, en, '  Collect   Request ')?.id).toBe('collect_request');
    expect(findTerm(glossary, en, '1930 HELPLINE')?.id).toBe('helpline_1930');
  });

  it('returns undefined for a new word', () => {
    expect(findTerm(glossary, en, 'moneylender')).toBeUndefined();
    expect(findTerm(glossary, en, '   ')).toBeUndefined();
  });
});

describe('insertMarker', () => {
  it('marks a whole English word, in any case', () => {
    expect(insertMarker('Pay the fee, not the fees.', 'fee', 'fee')).toBe('Pay the [[fee]], not the fees.');
    expect(insertMarker('Ask about Interest first.', 'interest', 'interest')).toBe('Ask about [[interest]] first.');
    expect(insertMarker('The fees went up.', 'fee', 'fee')).toBeNull();
  });

  it('marks only the first of two occurrences', () => {
    expect(insertMarker('Interest is extra. Ask about interest.', 'interest', 'interest')).toBe(
      '[[interest]] is extra. Ask about interest.',
    );
  });

  it('never marks inside an existing [[...]]', () => {
    expect(insertMarker('Use [[upi]] today.', 'upi', 'upi')).toBeNull();
    expect(insertMarker('A [[collect_request]] is a request to pay.', 'request', 'request')).toBe(
      'A [[collect_request]] is a [[request]] to pay.',
    );
  });

  it('finds whole Hindi words, where \\b would not', () => {
    const body = 'यह ठगी है। ठगी से बचो। पैसे पाने के लिए PIN की ज़रूरत नहीं।';
    expect(insertMarker(body, 'ठगी', 'scam')).toBe('यह [[scam]] है। ठगी से बचो। पैसे पाने के लिए PIN की ज़रूरत नहीं।');
    expect(insertMarker(body, 'PIN', 'pin')).toContain('के लिए [[pin]] की');
    // "पैस" is the start of "पैसे": the vowel sign after it belongs to the same word.
    expect(insertMarker(body, 'पैस', 'x')).toBeNull();
    // "ब्याज" followed by a nukta is a different word ("ब्याज़").
    expect(insertMarker('इस पर ब्याज\u093C नहीं।', 'ब्याज', 'interest')).toBeNull();
  });

  it('treats regex characters in the phrase as plain text', () => {
    expect(insertMarker('Call 1930 (helpline) now.', '1930 (helpline)', 'helpline_1930')).toBe(
      'Call [[helpline_1930]] now.',
    );
    expect(insertMarker('It costs ₹1,000.', '₹1,000', 'price')).toBe('It costs [[price]].');
    expect(insertMarker('Call 1930 now.', '1930 (helpline)', 'x')).toBeNull();
  });

  it('returns null when the phrase is not there', () => {
    expect(insertMarker('Nothing here.', 'loan', 'loan')).toBeNull();
    expect(insertMarker('Nothing here.', '  ', 'loan')).toBeNull();
  });

  it('can require the exact case', () => {
    expect(insertMarker('Interest is extra. Ask about interest.', 'interest', 'interest', true)).toBe(
      'Interest is extra. Ask about [[interest]].',
    );
    expect(insertMarker('Interest is extra.', 'interest', 'interest', true)).toBeNull();
  });

  it('findPhrase gives the phrase spelled as the body has it', () => {
    expect(findPhrase('Never share your PIN.', 'pin')).toBe('PIN');
    expect(findPhrase('Use [[upi]] today.', 'upi')).toBeNull();
  });
});

describe('mergeGlossary', () => {
  const g0: GlossaryTerm[] = [{ id: 'upi', word: 't:glossary.upi.word', simple: 't:glossary.upi.simple', example: 't:glossary.upi.example' }];
  const strings = (lang: string) => ({
    'glossary.upi.word': `UPI ${lang}`,
    'glossary.upi.simple': 's',
    'glossary.upi.example': 'e',
    'news.w.a.body': 'b',
  });

  it('adds a new entry and its strings after the last glossary key, without touching anything else', () => {
    const en0 = Object.freeze(strings('en'));
    const hi0 = Object.freeze(strings('hi'));
    const changed = entry({ id: 'upi', en: { ...entry().en, word: 'CHANGED' } });
    const r = mergeGlossary(Object.freeze([...g0]), en0, hi0, [entry(), changed, entry()]);
    expect(r.added).toEqual(['moneylender']);
    expect(r.glossary).toEqual([
      ...g0,
      {
        id: 'moneylender',
        word: 't:glossary.moneylender.word',
        simple: 't:glossary.moneylender.simple',
        example: 't:glossary.moneylender.example',
      },
    ]);
    expect(Object.keys(r.en)).toEqual([
      'glossary.upi.word',
      'glossary.upi.simple',
      'glossary.upi.example',
      'glossary.moneylender.word',
      'glossary.moneylender.simple',
      'glossary.moneylender.example',
      'news.w.a.body',
    ]);
    expect(r.en['glossary.upi.word']).toBe('UPI en');
    expect(r.hi['glossary.moneylender.word']).toBe('साहूकार');
    expect(en0).toEqual(strings('en'));
  });

  it('adds nothing the second time', () => {
    const once = mergeGlossary(g0, strings('en'), strings('hi'), [entry()]);
    const twice = mergeGlossary(once.glossary, once.en, once.hi, [entry()]);
    expect(twice.added).toEqual([]);
    expect(twice).toEqual({ ...once, added: [] });
  });

  it('leaves out an entry whose strings already exist', () => {
    const r = mergeGlossary(g0, { ...strings('en'), 'glossary.moneylender.word': 'old' }, strings('hi'), [entry()]);
    expect(r.added).toEqual([]);
    expect(r.en['glossary.moneylender.word']).toBe('old');
  });
});

describe('validateEntry', () => {
  it('accepts a good entry', () => {
    expect(validateEntry(entry(), forbidden)).toEqual([]);
  });

  it('rejects a meaning that is too long', () => {
    const long = entry({ en: { ...entry().en, simple: 'x'.repeat(101) } });
    expect(validateEntry(long, forbidden)).toEqual(['en.simple is 101 characters; the limit is 100']);
  });

  it('counts Hindi in visible characters, so a letter with its vowel sign counts once', () => {
    const at = (n: number) => entry({ hi: { ...entry().hi, simple: 'कि'.repeat(n) } });
    expect('कि'.repeat(100).length).toBe(200);
    expect(validateEntry(at(100), forbidden)).toEqual([]);
    expect(validateEntry(at(101), forbidden)).toEqual(['hi.simple is 101 characters; the limit is 100']);
  });

  it('needs every field in both languages, with Hindi meanings in Hindi', () => {
    expect(validateEntry({ ...entry(), hi: undefined } as unknown as NewEntry, forbidden)).toEqual(['hi is missing']);
    expect(validateEntry(entry({ en: { ...entry().en, example: ' ' } }), forbidden)).toEqual(['en.example is empty']);
    expect(validateEntry(entry({ hi: { ...entry().hi, simple: 'A secret code.' } }), forbidden)).toEqual([
      'hi.simple must be in Hindi',
    ]);
  });

  it('needs a snake_case id', () => {
    expect(validateEntry(entry({ id: 'Money Lender' }), forbidden)).toEqual([
      'id "Money Lender" must be snake_case (a-z, 0-9 and _)',
    ]);
  });

  it('rejects guarantees, advice and real brand names, in any spelling', () => {
    const say = (simple: string) => validateEntry(entry({ en: { ...entry().en, simple } }), forbidden);
    expect(say('Returns are Guaranteed here.')).toEqual(['en.simple must not contain "guaranteed"']);
    expect(say('Ammi says you should invest now.')).toEqual(['en.simple must not contain "you should invest"']);
    expect(say('A risk-free plan.')).toEqual([
      'en.simple must not contain "risk-free"',
      'en.simple must not contain "risk free"',
    ]);
    expect(forbiddenIn('Pay with PhonePe, G-Pay or PAYTM.', forbidden)).toEqual(
      expect.arrayContaining(['paytm', 'phonepe', 'phone pe', 'gpay', 'g pay']),
    );
    expect(forbiddenIn('Pay with Phone Pe.', forbidden)).toEqual(['phone pe']);
    expect(forbiddenIn('पेटीएम से भेजो।', forbidden)).toEqual(['पेटीएम']);
    expect(forbiddenIn('Ask about credit and the public library.', forbidden)).toEqual([]);
  });

  it('can require the words to be the phrases in the article', () => {
    expect(validateEntry(entry(), forbidden, { en: 'Moneylender', hi: 'साहूकार' })).toEqual([]);
    expect(validateEntry(entry(), forbidden, { en: 'moneylenders', hi: null })).toEqual([
      'en.word must be exactly "moneylenders", as written in the article',
    ]);
  });
});

describe('LLM reply schemas', () => {
  const word = { termId: 'fee', en_phrase: 'fee', hi_phrase: null, is_existing: false };

  it('accept good replies and reject missing, extra or wrong fields', () => {
    expect(ExtractResponse.safeParse({ terms: [word] }).success).toBe(true);
    expect(ExtractResponse.safeParse({ terms: [] }).success).toBe(true);
    expect(ExtractResponse.safeParse({ terms: [{ ...word, hi_phrase: undefined }] }).success).toBe(false);
    expect(ExtractResponse.safeParse({ terms: [{ ...word, extra: 1 }] }).success).toBe(false);
    expect(ExtractResponse.safeParse({ terms: [{ ...word, is_existing: 'no' }] }).success).toBe(false);
    expect(DefineResponse.safeParse({ en: entry().en, hi: entry().hi }).success).toBe(true);
    expect(DefineResponse.safeParse({ en: entry().en }).success).toBe(false);
  });

  it('give a strict JSON Schema: every key required, no extra keys, no length keywords', () => {
    const schema = z.toJSONSchema(ExtractResponse) as unknown as {
      additionalProperties: boolean;
      properties: { terms: { items: { required: string[]; additionalProperties: boolean } } };
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.terms.items.additionalProperties).toBe(false);
    expect(schema.properties.terms.items.required).toEqual(['termId', 'en_phrase', 'hi_phrase', 'is_existing']);
    const define = JSON.stringify(z.toJSONSchema(DefineResponse));
    expect(define).not.toMatch(/"(?:max|min)(?:Length|Items)"/);
    expect(define.match(/"additionalProperties":false/g)).toHaveLength(3);
  });
});

describe('markArticle', () => {
  const words = {
    en: { moneylender: 'moneylender', scam: 'scam', upi_pin: 'UPI PIN' },
    hi: { moneylender: 'साहूकार', scam: 'ठगी', upi_pin: 'UPI PIN' },
  };
  const article = {
    en: 'A moneylender may call it a deal. A scam is a trick.',
    hi: 'साहूकार इसे सौदा कह सकता है। ठगी एक चाल है।',
    terms: [] as string[],
  };
  const lender = { termId: 'moneylender', en_phrase: 'moneylender', hi_phrase: 'साहूकार' };

  it('marks a word in both bodies and adds it to terms', () => {
    const r = markArticle(article, [lender], words);
    expect(r.en).toBe('A [[moneylender]] may call it a deal. A scam is a trick.');
    expect(r.hi).toBe('[[moneylender]] इसे सौदा कह सकता है। ठगी एक चाल है।');
    expect(r.terms).toEqual(['moneylender']);
    expect(r.marked).toEqual(['moneylender']);
  });

  it('prefers the occurrence spelled like the dictionary word, so the sentence reads the same', () => {
    const r = markArticle(
      { en: 'Scam calls rise. Spot a scam early.', hi: 'ठगी से बचो।', terms: [] },
      [{ termId: 'scam', en_phrase: 'Scam', hi_phrase: 'ठगी' }],
      words,
    );
    expect(r.en).toBe('Scam calls rise. Spot a [[scam]] early.');
  });

  it('marks neither body when the Hindi cannot be marked', () => {
    const cases = [
      { ...lender, hi_phrase: null },
      { ...lender, hi_phrase: 'सूदखोर' },
      { termId: 'scam', en_phrase: 'scam', hi_phrase: 'ठगी' },
    ];
    const hiWithoutScam = { ...article, hi: 'साहूकार इसे सौदा कह सकता है।' };
    for (const w of cases) {
      const r = markArticle(hiWithoutScam, [w], words);
      expect(r).toMatchObject({ en: article.en, hi: hiWithoutScam.hi, terms: [], marked: [] });
      expect(r.skipped).toEqual([expect.objectContaining({ termId: w.termId, hindi: true })]);
    }
  });

  it('skips a phrase that is not the dictionary word, or not in the text', () => {
    const r = markArticle(
      article,
      [
        { termId: 'upi_pin', en_phrase: 'deal', hi_phrase: 'सौदा' },
        { termId: 'scam', en_phrase: 'scams', hi_phrase: 'ठगी' },
        { termId: 'upi_pin', en_phrase: 'UPI PIN', hi_phrase: 'UPI PIN' },
        { termId: 'unknown', en_phrase: 'trick', hi_phrase: 'चाल' },
      ],
      words,
    );
    expect(r).toMatchObject({ en: article.en, hi: article.hi, marked: [] });
    expect(r.skipped.map((s) => s.reason)).toEqual([
      '"deal" is not the dictionary word "UPI PIN"',
      '"scams" is not the dictionary word "scam"',
      'not found in the English text, outside [[...]]',
      'not in the dictionary in both languages',
    ]);
  });

  it('keeps a body within 600 characters', () => {
    const fits = { ...article, en: `A scam. ${'y'.repeat(BODY_CAP - 12)}` };
    const over = { ...article, en: `A scam. ${'y'.repeat(BODY_CAP - 11)}` };
    const w = [{ termId: 'scam', en_phrase: 'scam', hi_phrase: 'ठगी' }];
    expect(markArticle(fits, w, words).marked).toEqual(['scam']);
    expect(markArticle(over, w, words).skipped[0].reason).toBe('a body would go over 600 characters');
  });

  it('changes nothing the second time', () => {
    const w = [lender, { termId: 'scam', en_phrase: 'scam', hi_phrase: 'ठगी' }];
    const once = markArticle(article, w, words);
    const twice = markArticle(once, w, words);
    expect(once.marked).toEqual(['moneylender', 'scam']);
    expect(twice).toMatchObject({ en: once.en, hi: once.hi, terms: once.terms, marked: [] });
    expect(twice.skipped.map((s) => s.reason)).toEqual(['already marked', 'already marked']);
  });
});

describe('formatJson', () => {
  it('lays out JSON like the pack files', () => {
    const long = ['a', 'b'].map((c) => `t:news.2026-W41.${c.repeat(50)}`);
    const sample = { id: 'upi_fraud', terms: ['upi', 'upi_pin'], question: { options: long, correct: 1 }, reward: { wage: 60 }, empty: [] };
    expect(formatJson(sample)).toBe(
      [
        '{',
        '  "id": "upi_fraud",',
        '  "terms": ["upi", "upi_pin"],',
        '  "question": {',
        '    "options": [',
        `      "${long[0]}",`,
        `      "${long[1]}"`,
        '    ],',
        '    "correct": 1',
        '  },',
        '  "reward": {',
        '    "wage": 60',
        '  },',
        '  "empty": []',
        '}',
      ].join('\n'),
    );
  });

  it('keeps the data the same', () => {
    const articles = getEdition().articles;
    expect(JSON.parse(formatJson(articles))).toEqual(articles);
  });
});
