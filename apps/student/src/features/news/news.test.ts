import { describe, expect, it } from 'vitest';
import { earnLife } from '../../game/useGame';
import { startLife } from '../life/life';
import { parseBody } from './body';
import { editionLabel, editionMonday, getEdition, getTerm, STRINGS, t } from './content';
import { answerArticle, sourceId, summarize } from './progress';
import type { ArticleProgress } from './progress';
import { addWord } from './useWordWallet';

const edition = getEdition();
const article = edition.articles[0];
const right = article.question.correct;
const wrong = (right + 1) % article.question.options.length;
const wrong2 = (right + 2) % article.question.options.length;

describe('content', () => {
  it('has one edition of 5 articles', () => {
    expect(edition.id).toBe('2026-W41');
    expect(edition.articles).toHaveLength(5);
    expect(new Set(edition.articles.map((a) => a.edition))).toEqual(new Set([edition.id]));
  });

  it('every article and glossary key exists in en and hi (CLAUDE.md 7.2 rule 2)', () => {
    for (const a of edition.articles) {
      const keys = [a.headline, a.body, a.question.prompt, a.question.explanation, ...a.question.options];
      for (const term of a.terms) {
        const g = getTerm(term)!;
        keys.push(g.word, g.simple, g.example);
      }
      for (const k of keys) {
        expect(STRINGS.en).toHaveProperty([k.slice(2)]);
        expect(STRINGS.hi).toHaveProperty([k.slice(2)]);
      }
    }
  });

  it('every [[term]] in a body is in the glossary and in the article terms, in both languages', () => {
    for (const a of edition.articles) {
      for (const lang of ['en', 'hi'] as const) {
        const terms = parseBody(t(lang, a.body)).flatMap((s) => (s.kind === 'term' ? [s.termId] : []));
        expect(terms.length).toBeGreaterThan(0);
        for (const id of terms) {
          expect(getTerm(id), id).toBeDefined();
          expect(a.terms).toContain(id);
        }
      }
    }
  });

  it('bodies stay within 600 characters and wages are whole rupees (CLAUDE.md 7.2 rule 7)', () => {
    for (const a of edition.articles) {
      expect(t('en', a.body).length).toBeLessThanOrEqual(600);
      expect(t('hi', a.body).length).toBeLessThanOrEqual(600);
      expect(Number.isInteger(a.reward.wage) && a.reward.wage > 0).toBe(true);
    }
  });

  it('UI strings have the same keys in en and hi', () => {
    const ui = (l: 'en' | 'hi') => Object.keys(STRINGS[l]!).filter((k) => k.startsWith('news.ui.')).sort();
    expect(ui('hi')).toEqual(ui('en'));
  });

  it('dates the edition from its ISO week', () => {
    expect(editionMonday('2026-W41').toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(editionMonday('2026-W01').toISOString().slice(0, 10)).toBe('2025-12-29');
    expect(editionLabel('en', '2026-W41')).toBe('Week 41 · 5 October 2026');
  });
});

describe('parseBody', () => {
  it('splits text and [[term]] markers in order', () => {
    expect(parseBody('Pay on [[upi]] with a [[upi_pin]].')).toEqual([
      { kind: 'text', text: 'Pay on ' },
      { kind: 'term', termId: 'upi' },
      { kind: 'text', text: ' with a ' },
      { kind: 'term', termId: 'upi_pin' },
      { kind: 'text', text: '.' },
    ]);
    expect(parseBody('[[a]]')).toEqual([{ kind: 'term', termId: 'a' }]);
    expect(parseBody('no terms')).toEqual([{ kind: 'text', text: 'no terms' }]);
  });
});

describe('answerArticle (CLAUDE.md 5.8)', () => {
  it('a right first answer pays the full wage and finishes', () => {
    const r = answerArticle(undefined, article, right)!;
    expect(r).toMatchObject({ pay: article.reward.wage, attempt: 1 });
    expect(r.progress).toEqual({ picks: [right], correct: true, done: true, wage: article.reward.wage });
  });

  it('a wrong first answer pays nothing and allows one retry', () => {
    const r = answerArticle(undefined, article, wrong)!;
    expect(r.pay).toBe(0);
    expect(r.progress.done).toBe(false);
  });

  it('a right retry pays half the wage, rounded down', () => {
    const first = answerArticle(undefined, article, wrong)!.progress;
    const r = answerArticle(first, article, right)!;
    expect(r).toMatchObject({ pay: Math.floor(article.reward.wage / 2), attempt: 2 });
    expect(r.progress.done).toBe(true);
    const odd = { ...article, reward: { ...article.reward, wage: 75 } };
    expect(answerArticle(answerArticle(undefined, odd, wrong)!.progress, odd, right)!.pay).toBe(37);
  });

  it('a wrong retry pays nothing and ends the question', () => {
    const first = answerArticle(undefined, article, wrong)!.progress;
    const r = answerArticle(first, article, wrong2)!;
    expect(r.pay).toBe(0);
    expect(r.progress).toMatchObject({ done: true, correct: false, wage: 0 });
  });

  it('never pays twice: a finished question ignores taps, and so does repeating a wrong pick', () => {
    const done = answerArticle(undefined, article, right)!.progress;
    expect(answerArticle(done, article, right)).toBeNull();
    const first = answerArticle(undefined, article, wrong)!.progress;
    expect(answerArticle(first, article, wrong)).toBeNull();
    expect(answerArticle(undefined, article, 9)).toBeNull();
    expect(answerArticle(undefined, article, -1)).toBeNull();
  });

  it('is pure: never mutates the previous progress', () => {
    const first = Object.freeze({ ...answerArticle(undefined, article, wrong)!.progress, picks: Object.freeze([wrong]) as number[] });
    expect(() => answerArticle(first, article, right)).not.toThrow();
    expect(first.picks).toEqual([wrong]);
  });
});

describe('summarize', () => {
  it('counts done, earned and first-try answers, and flags a finished edition', () => {
    const progress: Record<string, ArticleProgress> = {};
    for (const a of edition.articles) progress[a.id] = answerArticle(undefined, a, a.question.correct)!.progress;
    const wrongFirst = edition.articles[1];
    const w = (wrongFirst.question.correct + 1) % wrongFirst.question.options.length;
    progress[wrongFirst.id] = answerArticle(answerArticle(undefined, wrongFirst, w)!.progress, wrongFirst, wrongFirst.question.correct)!.progress;
    const s = summarize(edition.articles, progress);
    const full = edition.articles.reduce((n, a) => n + a.reward.wage, 0);
    expect(s).toEqual({
      done: 5,
      total: 5,
      earned: full - wrongFirst.reward.wage + Math.floor(wrongFirst.reward.wage / 2),
      firstTry: 4,
      finished: true,
    });
    expect(summarize(edition.articles, {}).finished).toBe(false);
  });
});

describe('earn (game store)', () => {
  it('pays into the common wallet once per sourceId', () => {
    const life = startLife();
    const paid = earnLife(life, 60, sourceId(article))!;
    expect(paid.money).toBe(life.money + 60);
    expect(earnLife(paid, 60, sourceId(article))).toBeNull();
    expect(earnLife(life, 0, 'x')).toBeNull();
    expect(earnLife(life, 1.5, 'x')).toBeNull();
    expect(sourceId(article)).toBe(`news:2026-W41:${article.id}`);
  });
});

describe('Word Wallet', () => {
  it('adds new words first and never duplicates', () => {
    let w = addWord([], 'upi', 'a1');
    w = addWord(w, 'otp', 'a2');
    w = addWord(w, 'upi', 'a3');
    expect(w).toEqual([
      { termId: 'otp', articleId: 'a2' },
      { termId: 'upi', articleId: 'a1' },
    ]);
  });
});
