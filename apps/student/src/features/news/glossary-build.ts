// Glossary builder rules, shared by tools/build-glossary.ts (the laptop script) and its tests.
// Pure: no Node APIs, no network, no env. Only the tool talks to a model, at authoring time;
// nothing under src/ does (CLAUDE.md 7.1). The rules:
// - a word already in glossary.json is reused, matched by id or by its English word;
// - a new word needs a word, a simple meaning and an example in en and hi, within the caps and
//   without forbidden phrases (CLAUDE.md 7.2);
// - GlossaryWord shows the term's word in place of [[termId]], so a phrase is marked only where it
//   is that word, in both languages or in neither, and only while the body stays within 600 characters.
import { z } from 'zod';
import type { GlossaryTerm } from './types';

export type Strings = Record<string, string>;

/** Visible-character caps for glossary text (CLAUDE.md 7.2 rule 7). */
export const CAPS = { word: 30, simple: 100, example: 140 } as const;
/** Article body cap (CLAUDE.md 7.2 rule 7). */
export const BODY_CAP = 600;
/** Most words one EXTRACT call may return for an article. */
export const MAX_WORDS = 4;

// ---- LLM replies ------------------------------------------------------------------------------
// Each schema is used twice: as the JSON Schema the model must follow, and to check its reply.
// No length or count keywords: Anthropic's structured output rejects them, so validateEntry and
// MAX_WORDS enforce those instead.

export const ExtractResponse = z.strictObject({
  terms: z.array(
    z.strictObject({
      termId: z.string().describe('The dictionary id if the word is in the dictionary, else a new snake_case id'),
      en_phrase: z.string().describe('The exact text as it appears in the English article'),
      hi_phrase: z.string().nullable().describe('The exact text as it appears in the Hindi article, or null'),
      is_existing: z.boolean().describe('True if the word is already in the dictionary'),
    }),
  ),
});
export type Extracted = z.infer<typeof ExtractResponse>['terms'][number];

const TermText = z.strictObject({
  word: z.string().describe('The word as the student sees it in the article'),
  simple: z.string().describe('One simple sentence, at most 100 characters'),
  example: z.string().describe('One everyday line set in Hyderabad, at most 140 characters'),
});
export type TermText = z.infer<typeof TermText>;
export const DefineResponse = z.strictObject({ en: TermText, hi: TermText });

/** A new dictionary word in both languages, before it goes into glossary.json. */
export interface NewEntry {
  id: string;
  en: TermText;
  hi: TermText;
}

// ---- Matching ---------------------------------------------------------------------------------

/** How words are compared: NFKC, trimmed, single spaces, lower case. */
export function normalise(word: string): string {
  return word.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** "Collect request" -> "collect_request". Empty for a word with no a-z or 0-9 (e.g. Hindi). */
export function toTermId(word: string): string {
  return normalise(word).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export const isTermId = (id: string) => /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id);

const keyOf = (k: string) => (k.startsWith('t:') ? k.slice(2) : k);

/** The dictionary entry for a word, by id ("upi_pin") or by its English word ("UPI pin"); undefined if new. */
export function findTerm(glossary: readonly GlossaryTerm[], en: Strings, word: string): GlossaryTerm | undefined {
  const w = normalise(word);
  if (!w) return undefined;
  const id = toTermId(w);
  return glossary.find((g) => g.id === w || g.id === id || normalise(en[keyOf(g.word)] ?? '') === w);
}

/** Each term's word in one language, by id: what GlossaryWord shows for [[termId]]. */
export function termWords(glossary: readonly GlossaryTerm[], strings: Strings): Strings {
  const out: Strings = {};
  for (const g of glossary) {
    const w = strings[keyOf(g.word)];
    if (w !== undefined) out[g.id] = w;
  }
  return out;
}

// ---- Markers ----------------------------------------------------------------------------------

// Letters, vowel signs and nukta (\p{M}), digits and _ belong to a word. Regex \b only knows ASCII,
// so it would split Hindi words at every vowel sign.
const WORD_CHAR = String.raw`[\p{L}\p{M}\p{N}_]`;
const ANY_MARKER_RE = /\[\[[^\]]*\]\]/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where the first whole-word `phrase` outside any [[...]] is (any case unless `matchCase`), or null. */
function locate(body: string, phrase: string, matchCase: boolean): { start: number; end: number } | null {
  const p = phrase.trim();
  if (!p) return null;
  const markers = [...body.matchAll(ANY_MARKER_RE)].map((m) => [m.index, m.index + m[0].length]);
  const re = new RegExp(`(?<!${WORD_CHAR})${escapeRe(p)}(?!${WORD_CHAR})`, matchCase ? 'gu' : 'giu');
  for (const m of body.matchAll(re)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!markers.some(([a, b]) => start < b && end > a)) return { start, end };
  }
  return null;
}

/** The first whole-word `phrase` (any case) outside [[...]], spelled exactly as the body has it; null if none. */
export function findPhrase(body: string, phrase: string): string | null {
  const at = locate(body, phrase, false);
  return at && body.slice(at.start, at.end);
}

/**
 * Replaces the first whole-word `phrase` that is not inside an existing [[...]] with [[termId]], in any
 * case unless `matchCase`. Returns null when there is no such occurrence.
 */
export function insertMarker(body: string, phrase: string, termId: string, matchCase = false): string | null {
  const at = locate(body, phrase, matchCase);
  return at && `${body.slice(0, at.start)}[[${termId}]]${body.slice(at.end)}`;
}

/** The body as the reader sees it: each [[termId]] shown as its word (how BE-1's linter counts length). */
export function renderMarkers(body: string, words: Strings): string {
  return body.replace(/\[\[([a-z0-9_]+)\]\]/g, (_, id: string) => words[id] ?? id);
}

const segmenter = new Intl.Segmenter();
/** Visible characters (grapheme clusters): a Hindi letter with its vowel sign counts once. */
export const visibleLength = (s: string) => [...segmenter.segment(s)].length;

/** Within 600 both as stored (news.test.ts counts that) and as the reader sees it (BE-1's linter). */
export const bodyFits = (body: string, words: Strings) =>
  body.length <= BODY_CAP && visibleLength(renderMarkers(body, words)) <= BODY_CAP;

// ---- Dictionary -------------------------------------------------------------------------------

const FIELDS = ['word', 'simple', 'example'] as const;
const LANGS = ['en', 'hi'] as const;

/**
 * Adds new entries and their glossary.<id>.word|simple|example strings in en and hi. Never changes or
 * removes anything: an entry whose id or strings already exist is left out. New strings go after the
 * last glossary.* key. Returns new objects; the inputs are untouched.
 */
export function mergeGlossary(
  glossary: readonly GlossaryTerm[],
  en: Strings,
  hi: Strings,
  entries: readonly NewEntry[],
): { glossary: GlossaryTerm[]; en: Strings; hi: Strings; added: string[] } {
  const out = [...glossary];
  const ids = new Set(glossary.map((g) => g.id));
  const strings = { en, hi };
  const fresh: Record<'en' | 'hi', [string, string][]> = { en: [], hi: [] };
  const added: string[] = [];
  for (const e of entries) {
    const keys = FIELDS.map((f) => `glossary.${e.id}.${f}`);
    if (ids.has(e.id) || keys.some((k) => k in en || k in hi)) continue;
    ids.add(e.id);
    added.push(e.id);
    out.push({ id: e.id, word: `t:${keys[0]}`, simple: `t:${keys[1]}`, example: `t:${keys[2]}` });
    for (const lang of LANGS) FIELDS.forEach((f, i) => fresh[lang].push([keys[i], e[lang][f]]));
  }
  const place = (lang: 'en' | 'hi') => {
    const pairs = Object.entries(strings[lang]);
    let at = pairs.length;
    for (let i = pairs.length - 1; i >= 0; i--) {
      if (pairs[i][0].startsWith('glossary.')) {
        at = i + 1;
        break;
      }
    }
    return Object.fromEntries([...pairs.slice(0, at), ...fresh[lang], ...pairs.slice(at)]);
  };
  return { glossary: out, en: place('en'), hi: place('hi'), added };
}

// ---- Checks -----------------------------------------------------------------------------------

/** Folded for matching, like BE-1's linter: NFKC, no invisible characters or nukta, lower case, no punctuation. */
const fold = (s: string) =>
  ` ${s
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]|\u093C/g, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()} `;

/** The forbidden phrases in `text`: whole words, any case; "Pay-tm" hits "paytm", "PhonePe" hits "phone pe". */
export function forbiddenIn(text: string, forbidden: readonly string[]): string[] {
  const t = fold(text);
  return forbidden.filter((f) => {
    const w = fold(f).trim();
    return w !== '' && (t.includes(` ${w} `) || t.includes(` ${w.replace(/ /g, '')} `));
  });
}

/**
 * What is wrong with a generated entry; empty when it is fine. Checks a snake_case id; a word, simple
 * meaning and example in en and hi within 30/100/140 visible characters; Hindi meanings in Devanagari;
 * no forbidden phrase. `expect` gives the article's phrases, which the words must equal (any case).
 */
export function validateEntry(
  entry: NewEntry,
  forbidden: readonly string[],
  expect: { en?: string; hi?: string | null } = {},
): string[] {
  const problems: string[] = [];
  if (!isTermId(entry.id)) problems.push(`id "${entry.id}" must be snake_case (a-z, 0-9 and _)`);
  for (const lang of LANGS) {
    const text = entry[lang] as Partial<TermText> | undefined;
    if (!text) {
      problems.push(`${lang} is missing`);
      continue;
    }
    for (const f of FIELDS) {
      const v = text[f]?.trim() ?? '';
      if (!v) {
        problems.push(`${lang}.${f} is empty`);
        continue;
      }
      const n = visibleLength(v);
      if (n > CAPS[f]) problems.push(`${lang}.${f} is ${n} characters; the limit is ${CAPS[f]}`);
      if (lang === 'hi' && f !== 'word' && !/[\u0900-\u097F]/.test(v)) problems.push(`hi.${f} must be in Hindi`);
      for (const hit of forbiddenIn(v, forbidden)) problems.push(`${lang}.${f} must not contain "${hit}"`);
    }
    const want = expect[lang];
    if (want && text.word !== undefined && normalise(text.word) !== normalise(want))
      problems.push(`${lang}.word must be exactly "${want}", as written in the article`);
  }
  return problems;
}

// ---- Marking one article ----------------------------------------------------------------------

export interface WordToMark {
  termId: string;
  en_phrase: string;
  hi_phrase: string | null;
}

export interface MarkResult {
  en: string;
  hi: string;
  terms: string[];
  marked: string[];                                  // termIds marked in both bodies
  skipped: { termId: string; phrase: string; reason: string; hindi: boolean }[];
}

/**
 * Marks each word as [[termId]] in the English and the Hindi body, or in neither. A word is skipped
 * when it is already marked, has no dictionary word, its phrase is not that word, a phrase is not in
 * the text, or a body would go over 600 characters. `words` holds each term's word per language.
 */
export function markArticle(
  article: { en: string; hi: string; terms: readonly string[] },
  toMark: readonly WordToMark[],
  words: { en: Strings; hi: Strings },
): MarkResult {
  let { en, hi } = article;
  const terms = [...article.terms];
  const marked: string[] = [];
  const skipped: MarkResult['skipped'] = [];
  for (const w of toMark) {
    const skip = (reason: string, hindi = false) => skipped.push({ termId: w.termId, phrase: w.en_phrase, reason, hindi });
    const enWord = words.en[w.termId];
    const hiWord = words.hi[w.termId];
    if (terms.includes(w.termId) || en.includes(`[[${w.termId}]]`) || hi.includes(`[[${w.termId}]]`)) {
      skip('already marked');
      continue;
    }
    if (enWord === undefined || hiWord === undefined) {
      skip('not in the dictionary in both languages');
      continue;
    }
    if (normalise(w.en_phrase) !== normalise(enWord)) {
      skip(`"${w.en_phrase}" is not the dictionary word "${enWord}"`);
      continue;
    }
    // Prefer an occurrence spelled exactly like the dictionary word, so the sentence reads the same.
    const nextEn = insertMarker(en, enWord, w.termId, true) ?? insertMarker(en, w.en_phrase, w.termId);
    if (nextEn === null) {
      skip('not found in the English text, outside [[...]]');
      continue;
    }
    if (w.hi_phrase === null) {
      skip('no matching phrase in the Hindi text', true);
      continue;
    }
    if (normalise(w.hi_phrase) !== normalise(hiWord)) {
      skip(`Hindi "${w.hi_phrase}" is not the dictionary word "${hiWord}"`, true);
      continue;
    }
    const nextHi = insertMarker(hi, hiWord, w.termId, true) ?? insertMarker(hi, w.hi_phrase, w.termId);
    if (nextHi === null) {
      skip(`Hindi "${w.hi_phrase}" not found in the Hindi text, outside [[...]]`, true);
      continue;
    }
    if (!bodyFits(nextEn, words.en) || !bodyFits(nextHi, words.hi)) {
      skip(`a body would go over ${BODY_CAP} characters`);
      continue;
    }
    en = nextEn;
    hi = nextHi;
    terms.push(w.termId);
    marked.push(w.termId);
  }
  return { en, hi, terms, marked, skipped };
}

// ---- JSON files -------------------------------------------------------------------------------

/**
 * JSON laid out like the pack files (Prettier at 120 columns): 2-space indent, one key per line, an
 * array of plain values on one line when that line fits. An unchanged file comes out byte for byte.
 */
export function formatJson(value: unknown, width = 120): string {
  return layout(value, '', '', '', width);
}

function layout(v: unknown, indent: string, prefix: string, suffix: string, width: number): string {
  const inner = `${indent}  `;
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every((x) => x === null || typeof x !== 'object')) {
      const one = `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (indent.length + prefix.length + one.length + suffix.length <= width) return one;
    }
    const items = v.map((x, i) => {
      const s = i < v.length - 1 ? ',' : '';
      return inner + layout(x, inner, '', s, width) + s;
    });
    return `[\n${items.join('\n')}\n${indent}]`;
  }
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([k, x], i) => {
      const p = `${JSON.stringify(k)}: `;
      const s = i < entries.length - 1 ? ',' : '';
      return inner + p + layout(x, inner, p, s, width) + s;
    });
    return `{\n${lines.join('\n')}\n${indent}}`;
  }
  return JSON.stringify(v);
}
