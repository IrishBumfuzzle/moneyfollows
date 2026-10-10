// Guardrail linter for content (CLAUDE.md 7.2). A pure library: no file or network access.
// scripts/lint-content.ts reads the files and calls validateContent.
import {
  ArticleSchema,
  EventCardSchema,
  GlossaryTermSchema,
  I18nFileSchema,
  PersonaSchema,
  PlaceSchema,
  QuizQuestionSchema,
  ScamMessageSchema,
  ScenarioSchema,
} from '@paisa/shared';
import { BadgeSchema } from './badges';
import { JarSplitRoundSchema } from './jar-splitter';

export interface Guardrails {
  brands: string[];
  promises: string[];
  shaming: string[];
  investingTerms: string[];
  allowedLinks: string[];
  allowedNumbers: string[];
  /** Reserved, never-real domains (e.g. "example", "invalid") that Scam or Safe? message bodies may show. */
  scamPlaceholderDomains?: string[];
  /** Clearly fake numbers that Scam or Safe? message bodies may show. */
  scamPlaceholderNumbers?: string[];
  fictionalAssets: string[];
  /** Longest allowed delay, in weeks. Defaults to 11: the game is 12 weeks long. */
  maxDelayWeeks?: number;
  /** Caps in visible characters (grapheme clusters). Keys are the cap names used by capFor. */
  lengthCaps: { story: number; label: number; lesson: number; note: number } & Record<string, number>;
}

export interface ContentFile {
  /** Path inside packages/content, e.g. "scenarios/plan_budget.json". */
  path: string;
  data: unknown;
}

export interface Issue {
  file: string;
  id: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidateInput {
  files: ContentFile[];
  /** Language code to its flat key map (keys without "t:"). */
  i18n: Record<string, Record<string, unknown>>;
  guardrails: Guardrails;
  /** Languages that must exist and be complete. Defaults to en and hi (CLAUDE.md 7.2 rule 2). */
  requiredLanguages?: string[];
  /** CONTENT_VERSION from manifest.json. Checked when given. */
  contentVersion?: string;
}

type Kind = 'scenario' | 'event' | 'quiz' | 'scam' | 'persona' | 'badge' | 'jar' | 'place' | 'glossary' | 'article';

interface Item {
  kind: Kind;
  file: string;
  id: string;
  data: Record<string, unknown>;
}

const SCHEMAS = {
  scenario: ScenarioSchema,
  event: EventCardSchema,
  quiz: QuizQuestionSchema,
  scam: ScamMessageSchema,
  persona: PersonaSchema,
  badge: BadgeSchema,
  jar: JarSplitRoundSchema,
  place: PlaceSchema,
  glossary: GlossaryTermSchema,
  article: ArticleSchema,
} as const;

function kindOf(path: string): Kind | null {
  const parts = path.replace(/\\/g, '/').split('/');
  const base = parts[parts.length - 1] ?? '';
  if (base === 'personas.json') return 'persona';
  if (base === 'places.json') return 'place';
  if (base === 'glossary.json') return 'glossary';
  if (parts.includes('news')) return 'article';
  if (parts.includes('rewards') && base === 'badges.json') return 'badge';
  if (parts.includes('scenarios')) return 'scenario';
  if (parts.includes('events')) return 'event';
  if (parts.includes('quizzes')) return 'quiz';
  if (parts.includes('minigames') && base === 'jar-splitter.json') return 'jar';
  if (parts.includes('minigames')) return 'scam';
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---- Text normalisation -------------------------------------------------------------------

// Zero-width space/joiners, word joiner, BOM and soft hyphen: invisible, so they must not split a word.
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
// The Devanagari nukta: "फ़ोन" and "फोन" are spelt both ways, so matching ignores it.
const NUKTA_RE = /\u093C/g;
// First code point ("0") of each decimal digit block that NFKC leaves alone: Arabic-Indic,
// Extended Arabic-Indic, Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam.
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];

/** Script digits to ASCII digits (१९३० becomes 1930). */
export function toAsciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0) ?? 0;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9);
    return zero === undefined ? d : String(cp - zero);
  });
}

/** NFKC (full-width and compatibility forms), no invisible characters, no nukta, ASCII digits, lower case. */
export function normalizeText(text: string): string {
  return toAsciiDigits(text.normalize('NFKC').replace(INVISIBLE_RE, '').replace(NUKTA_RE, '')).toLowerCase();
}

/** The normalised text with punctuation and symbols removed, so "S.B.I." reads "sbi" and "G-Pay" reads "gpay". */
export function stripPunctuation(normalized: string): string {
  return normalized
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BEFORE = '(?<![\\p{L}\\p{N}\\p{M}])';
const AFTER = '(?![\\p{L}\\p{N}\\p{M}])';

interface TermMatcher {
  term: string;
  re: RegExp;
}

/**
 * A matcher for one guardrail term. It runs on stripped text and needs whole-word (token)
 * boundaries, so short terms ("lic", "sbi") never match inside ordinary words. A space in the
 * term also matches no space ("phone pe" catches "phonepe"). In longer Latin-script words a
 * single space may sit between letters ("pay tm" for "paytm").
 */
function termMatcher(term: string): TermMatcher | null {
  const tokens = stripPunctuation(normalizeText(term)).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  const tokenRe = (token: string) => {
    const chars = [...token].map(escapeRe);
    return /^[a-z0-9]{5,}$/.test(token) ? chars.join('\\s?') : chars.join('');
  };
  return { term, re: new RegExp(`${BEFORE}${tokens.map(tokenRe).join('\\s*')}${AFTER}`, 'u') };
}

const matchersFor = (terms: string[]): TermMatcher[] =>
  terms.map(termMatcher).filter((m): m is TermMatcher => m !== null);

/** The first guardrail term found in the text, or null. */
function findTerm(stripped: string, matchers: TermMatcher[]): string | null {
  for (const m of matchers) if (m.re.test(stripped)) return m.term;
  return null;
}

// ---- Links ----------------------------------------------------------------------------------

// A scheme or www. link, or a bare domain with any top-level domain of two or more letters
// (wa.me, x.shop, kyc.example). Runs on normalised text, so full-width dots are plain dots.
const LINK_RE =
  /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.)[^\s<>"'`]+|(?<![\p{L}\p{N}@._-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[a-z]{2,}(?![\p{L}\p{N}-])(?:[/?#:][^\s<>"'`]*)?/gu;

/** The host of a link: no scheme, user, port, path or trailing dot, in lower case. */
export function linkHost(link: string): string {
  return link
    .toLowerCase()
    .replace(/[.,;:!?)\]}'"]+$/, '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^[^@]*@/, '')
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '');
}

/** True when the host is an allowed domain or a subdomain of one. Look-alikes do not count. */
export function hostAllowed(host: string, allowed: string[]): boolean {
  return allowed.some((domain) => {
    const d = domain.toLowerCase().replace(/^\.+|\.+$/g, '');
    return host === d || host.endsWith(`.${d}`);
  });
}

export function findLinks(text: string): string[] {
  return normalizeText(text).match(LINK_RE) ?? [];
}

// ---- Phone numbers --------------------------------------------------------------------------

// Seven or more digits with optional spaces, dashes, dots or brackets between them, optional "+".
const PHONE_RE = /(?<![\d])\+?\(?\d(?:[\s\-.()]{0,2}\d){6,}(?!\d)/g;
const MIN_PHONE_DIGITS = 8;
const digitsOf = (s: string) => toAsciiDigits(s).replace(/\D/g, '');

/** Phone-like numbers in the text (8 or more digits), in any digit script. */
export function findPhoneNumbers(text: string): string[] {
  return (normalizeText(text).match(PHONE_RE) ?? []).filter((m) => digitsOf(m).length >= MIN_PHONE_DIGITS);
}

// ---- Imperative investment advice ---------------------------------------------------------

const SENTENCE_SPLIT = /[.!?।\n]+/u;
// Pushes towards an action, unless negated ("you should never…").
const EN_PUSH =
  /\b(?:you (?:should|must|need to|have to|ought to)(?! (?:not|never)\b)|(?:invest|buy) (?:now|today|right away)|buy|put (?:all |more )?(?:of )?(?:your |the )?money)\b/u;
const EN_PUSH_ALONE = /\b(?:invest (?:now|today|right away)|start investing (?:now|today))\b/u;
const EN_TARGET = /\b(?:invest\w*|stocks?|shares|mutual funds?|funds)\b/u;
// Hindi, after normalisation (no nukta): "ज़रूर/अभी/आज ही … निवेश/ख़रीद/लगा…", "निवेश करें", "ख़रीदें", "… चाहिए".
const HI_PUSH = new RegExp(
  [
    `(?:जरूर|अभी|आज ही)\\s+(?:\\S+\\s+){0,3}?(?:निवेश|खरीद|लगा)\\S*`,
    `निवेश\\s*(?:करें|करो|कीजिए|कीजिये|करना चाहिए|करने चाहिए)`,
    `खरीद(?:ें|ो|िए|िये|ना चाहिए|ने चाहिए)${AFTER}`,
    `लगा(?:ना|ने) चाहिए`,
  ].join('|'),
  'u',
);
const HI_PUSH_ALONE = /(?:जरूर|अभी|आज ही)\s+निवेश/u;
const HI_TARGET = /निवेश|शेयर|फंड|स्टॉक/u;

// A push right after a negation is advice against it: "you should never put all your money…".
const NEGATED = /(?:\b(?:not|never|don't|dont|no)|(?<![\p{L}\p{M}])(?:नहीं|मत|न))\s+$/u;

/** The first sentence that pushes the reader to invest or buy, or null. */
export function findImperativeAdvice(text: string, fictionalAssets: string[]): string | null {
  const assets = fictionalAssets.map((a) => normalizeText(a));
  for (const raw of normalizeText(text).split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (EN_PUSH_ALONE.test(sentence) || HI_PUSH_ALONE.test(sentence)) return sentence;
    const namesAsset = assets.some((a) => sentence.includes(a));
    for (const push of [EN_PUSH, HI_PUSH]) {
      const m = push.exec(sentence);
      if (!m || NEGATED.test(sentence.slice(0, m.index))) continue;
      const rest = sentence.slice(0, m.index) + ' ' + sentence.slice(m.index + m[0].length);
      if (namesAsset || EN_TARGET.test(rest) || HI_TARGET.test(rest)) return sentence;
    }
  }
  return null;
}

// ---- Single numbers on investing cards ----------------------------------------------------

const PERCENT_RE = /(?:\d+(?:\.\d+)?|\{\{\s*\w+\s*\}\})\s?(?:%|percent\b|per cent\b|प्रतिशत|फीसदी|फीसद)/gu;
// One amount, read whole: "₹1,400" never matches as "₹1,40".
const AMOUNT = String.raw`₹\s?(?:\d[\d,]*(?:\.\d+)?(?!\d)(?!,\d)|\{\{\s*\w+\s*\}\})`;
// Words that join amounts into a range or list: "₹400 to ₹600", "₹{{low}}, ₹{{avg}} or ₹{{high}}", "₹400 से ₹600".
const RANGE_JOIN = String.raw`\s*(?:,|to|or|and|-|–|से|या|और)\s*(?:about\s+|लगभग\s+)?`;
// A forward-looking claim about one ₹ outcome: "could become ₹500", "will be worth ₹500", "₹500 हो सकता है", "₹500 मिलेंगे".
const EN_CLAIM_RE = new RegExp(
  String.raw`\b(?:could|might|may|will|would|can)\s+(?:\w+\s+){0,3}?(?:become|be(?:\s+worth)?|grow(?:\s+to)?|end(?:\s+(?:near|at|up at))?|reach|turn into|give(?:\s+you)?|return|earn|make)\s+(?:about\s+|around\s+|nearly\s+|up to\s+|only\s+)?` +
    String.raw`${AMOUNT}(?!${RANGE_JOIN}₹)`,
  'u',
);
const HI_CLAIM_RE = new RegExp(
  String.raw`(?<!₹\S*${RANGE_JOIN})${AMOUNT}\s+(?:(?:तक|ही)\s+)?` +
    String.raw`(?:(?:हो|बन)\s+(?:सकता|सकती|सकते|जाएगा|जाएगी|जाएँगे|जाएंगे)|मिल(?:ेगा|ेंगे|ेगी|\s+सकता|\s+सकते))`,
  'u',
);

/** How many percentages a text quotes ("8%", "8 percent", "8 प्रतिशत", "{{rate}}%"). */
export function countPercentages(text: string): number {
  return (normalizeText(text).match(PERCENT_RE) ?? []).length;
}

/** A sentence that projects a single ₹ outcome ("could become ₹500") instead of a range, or null. */
export function findSingleRupeeProjection(text: string): string | null {
  for (const raw of normalizeText(text).split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    if (EN_CLAIM_RE.test(sentence) || HI_CLAIM_RE.test(sentence)) return sentence;
  }
  return null;
}

// ---- Paisa Times term markers --------------------------------------------------------------

/** A well-formed marker: [[termId]] with a lower-case glossary id. */
const MARKER_RE = /\[\[([a-z0-9_]+)\]\]/g;
/** Anything that looks like a marker, well formed or not: [[UPI]], [[ upi ]], [[loan-app]]. */
const ANY_MARKER_RE = /\[\[([^\]]*)\]\]/g;

/** The distinct glossary ids an article body marks with [[termId]], in order of first use. */
export function termMarkers(text: string): string[] {
  return [...new Set([...text.matchAll(MARKER_RE)].map((m) => m[1] ?? ''))];
}

/** Markers that are not [[lower_case_id]], e.g. "[[UPI]]" or "[[ upi ]]". */
export function malformedMarkers(text: string): string[] {
  return [...text.matchAll(ANY_MARKER_RE)].map((m) => m[0]).filter((m) => !/^\[\[[a-z0-9_]+\]\]$/.test(m));
}

/** The body as the reader sees it: each [[termId]] replaced by that term's word (or its id when unknown). */
export function renderMarkers(text: string, words: Record<string, string>): string {
  return text.replace(MARKER_RE, (_, id: string) => words[id] ?? id);
}

// ---- Placeholders, lengths, versions ------------------------------------------------------

/** react-i18next default interpolation: {{name}}. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] ?? ''))].sort();
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null;
/** Visible characters (grapheme clusters), so a Hindi letter with its vowel sign counts once. */
export function visibleLength(text: string): number {
  return segmenter ? [...segmenter.segment(text)].length : [...text].length;
}

/**
 * Which length cap applies to a key (README "Length caps"). Checked in order: Paisa Times
 * headlines and bodies, glossary words, meanings and examples, place names, scam.why.* hints,
 * reflections, the assumption banner, common.* buttons, badge.* and jar.check.* strings, then key
 * endings (so article questions reuse the question, option and explanation caps).
 */
export function capFor(key: string): string | null {
  if (key.startsWith('news.') && key.endsWith('.headline')) return 'headline';
  if (key.startsWith('news.') && key.endsWith('.body')) return 'articleBody';
  if (key.startsWith('glossary.') && key.endsWith('.word')) return 'glossaryWord';
  if (key.startsWith('glossary.') && key.endsWith('.simple')) return 'glossarySimple';
  if (key.startsWith('glossary.') && key.endsWith('.example')) return 'glossaryExample';
  if (key.startsWith('place.')) return 'placeName';
  if (key.startsWith('scam.why.')) return 'hint';
  if (key.startsWith('reflection.')) return 'reflection';
  if (key === 'assumption.banner') return 'banner';
  if (key.startsWith('common.')) return 'label';
  if (key.startsWith('badge.') && key.endsWith('.name')) return 'badgeName';
  if (key.startsWith('badge.') && key.endsWith('.desc')) return 'badgeDesc';
  if (key.startsWith('jar.check.')) return 'feedback';
  if (key.startsWith('speaker.')) return 'speaker';
  if (key.endsWith('.story')) return 'story';
  if (key.endsWith('.label')) return 'label';
  if (key.endsWith('.lesson')) return 'lesson';
  if (/\.(?:note|later\d*)$/.test(key)) return 'note';
  if (key.endsWith('.q')) return 'question';
  if (/\.o\d+$/.test(key)) return 'option';
  if (key.endsWith('.why')) return 'explanation';
  if (/\.s\d+$/.test(key)) return 'segment';
  if (key.endsWith('.sender')) return 'sender';
  if (key.endsWith('.bio')) return 'bio';
  if (key.startsWith('persona.') && key.endsWith('.name')) return 'name';
  if (key.startsWith('persona.') && key.endsWith('.goal')) return 'goal';
  return null;
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i;
const DATE_VERSION_RE = /^(\d{4})([.-])(\d{2})\2(\d{2})(?:\.(0|[1-9]\d*))?$/;

/** CONTENT_VERSION must be semver (1.2.3) or a real date (YYYY.MM.DD, optional .N). */
export function isValidContentVersion(version: string): boolean {
  if (/^\d{4}[.-]\d{2}[.-]\d{2}/.test(version)) {
    const m = version.match(DATE_VERSION_RE);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[3]), Number(m[4])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return y >= 2000 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  }
  return SEMVER_RE.test(version);
}

/** Every "t:" key used inside an item, without the prefix. */
export function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (value.startsWith('t:')) out.add(value.slice(2));
  } else if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectKeys(v, out);
  }
  return out;
}

const choicesOf = (item: Item): Record<string, unknown>[] =>
  Array.isArray(item.data.choices) ? item.data.choices.filter(isRecord) : [];
const delayedOf = (choice: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(choice.delayed) ? choice.delayed.filter(isRecord) : [];
const flagsOf = (effects: unknown): string[] =>
  isRecord(effects) && Array.isArray(effects.flags)
    ? effects.flags.filter((f): f is string => typeof f === 'string')
    : [];

export function validateContent(input: ValidateInput, opts: { strict: boolean }): Issue[] {
  const { guardrails, i18n } = input;
  const issues: Issue[] = [];
  const add = (file: string, id: string, rule: string, message: string, severity: Issue['severity'] = 'error') =>
    issues.push({ file, id, rule, message, severity });

  const brands = matchersFor(guardrails.brands);
  const promises = matchersFor(guardrails.promises);
  const shaming = matchersFor(guardrails.shaming);
  const investingTerms = matchersFor(guardrails.investingTerms);
  const allowedNumbers = new Set(guardrails.allowedNumbers.map(digitsOf));
  const placeholderNumbers = new Set((guardrails.scamPlaceholderNumbers ?? []).map(digitsOf));
  const placeholderDomains = guardrails.scamPlaceholderDomains ?? [];
  const maxDelay = guardrails.maxDelayWeeks ?? 11;

  // ---- Content version ----------------------------------------------------------------------
  if (input.contentVersion !== undefined && !isValidContentVersion(input.contentVersion)) {
    add(
      'manifest.json',
      'version',
      'version',
      `content version "${input.contentVersion}" must be semver (1.2.3) or a date (YYYY.MM.DD, optional .N)`,
    );
  }

  // ---- Rule 1: schema, choice counts, unique ids -------------------------------------------
  const items: Item[] = [];
  const seenIds = new Map<string, string>();
  for (const file of input.files) {
    const kind = kindOf(file.path);
    if (!kind) continue;
    if (!Array.isArray(file.data)) {
      add(file.path, '-', 'schema', 'file must contain a JSON array');
      continue;
    }
    file.data.forEach((raw: unknown, index: number) => {
      const id = isRecord(raw) && typeof raw.id === 'string' ? raw.id : `[${index}]`;
      const parsed = SCHEMAS[kind].safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          add(file.path, id, 'schema', `${issue.path.join('.') || '(item)'}: ${issue.message}`);
        }
      }
      if (!id.startsWith('[')) {
        // Places, glossary terms and articles have their own id spaces; an article id is unique per edition.
        const edition = isRecord(raw) && typeof raw.edition === 'string' ? raw.edition : '';
        const scope =
          kind === 'place' || kind === 'glossary' ? `${kind}:${id}` : kind === 'article' ? `news:${edition}:${id}` : id;
        const first = seenIds.get(scope);
        if (first) add(file.path, id, 'duplicate_id', `id "${id}" is also used in ${first}`);
        else seenIds.set(scope, file.path);
      }
      if (isRecord(raw)) items.push({ kind, file: file.path, id, data: raw });
    });
  }

  // ---- Cross-item rules: flags, delays, personas --------------------------------------------
  const cards = items.filter((i) => i.kind === 'scenario' || i.kind === 'event');
  const setFlags = new Set<string>();
  for (const card of cards)
    for (const choice of choicesOf(card)) {
      for (const f of flagsOf(choice.effects)) setFlags.add(f);
      for (const d of delayedOf(choice)) for (const f of flagsOf(d.effects)) setFlags.add(f);
    }
  const personaIds = new Set(
    items
      .filter((i) => i.kind === 'persona')
      .map((i) => i.id)
      .filter((id) => !id.startsWith('[')),
  );
  for (const card of cards) {
    const flag = card.data.requiresFlag;
    if (typeof flag === 'string' && !setFlags.has(flag)) {
      add(
        card.file,
        card.id,
        'requires_flag',
        `requiresFlag "${flag}" is never set by any choice, so this card never shows`,
      );
    }
    for (const choice of choicesOf(card))
      for (const d of delayedOf(choice)) {
        if (typeof d.afterWeeks === 'number' && d.afterWeeks > maxDelay) {
          add(
            card.file,
            card.id,
            'delay',
            `choice "${String(choice.id)}" waits ${d.afterWeeks} weeks; the most is ${maxDelay} so it lands inside the 12-week game`,
          );
        }
      }
    const personas = Array.isArray(card.data.personas) ? card.data.personas : [];
    if (personaIds.size > 0 && !personas.some((p) => typeof p === 'string' && personaIds.has(p))) {
      add(
        card.file,
        card.id,
        'no_persona',
        `targets only personas that are not in personas.json (${personas.join(', ')})`,
      );
    }
  }

  // ---- Places: every card's location and sublocation is on the map (5.8) ----------------
  // Checked only when places.json is part of the input, so a test or tool can lint cards alone.
  const placeItems = items.filter((i) => i.kind === 'place');
  if (placeItems.length > 0) {
    const placeById = new Map(placeItems.map((p) => [p.id, p]));
    const childrenOf = (p: Item | undefined): string[] =>
      p && Array.isArray(p.data.children) ? p.data.children.filter((c): c is string => typeof c === 'string') : [];
    for (const place of placeItems) {
      const parentId = place.data.parent;
      if (typeof parentId === 'string') {
        const parent = placeById.get(parentId);
        if (!parent || typeof parent.data.parent === 'string') {
          add(place.file, place.id, 'place_tree', `parent "${parentId}" is not a top-level place in places.json`);
        } else if (!childrenOf(parent).includes(place.id)) {
          add(place.file, place.id, 'place_tree', `"${parentId}" does not list "${place.id}" in its children`);
        }
      }
      for (const child of childrenOf(place)) {
        if (placeById.get(child)?.data.parent !== place.id) {
          add(
            place.file,
            place.id,
            'place_tree',
            `child "${child}" must be a place in places.json with parent "${place.id}"`,
          );
        }
      }
    }
    for (const card of cards) {
      const location = card.data.location;
      const place = typeof location === 'string' ? placeById.get(location) : undefined;
      if (typeof location === 'string' && (!place || typeof place.data.parent === 'string')) {
        add(card.file, card.id, 'unknown_location', `location "${location}" is not a top-level place in places.json`);
      }
      const sub = card.data.sublocation;
      if (typeof sub === 'string') {
        if (placeById.get(sub)?.data.parent !== location || !childrenOf(place).includes(sub)) {
          add(
            card.file,
            card.id,
            'unknown_sublocation',
            `sublocation "${sub}" is not a sub-map location of "${String(location)}" in places.json`,
          );
        }
      }
    }
  }

  // ---- i18n files themselves ---------------------------------------------------------------
  const langs = Object.keys(i18n);
  const tables: Record<string, Record<string, string>> = {};
  for (const lang of langs) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(i18n[lang] ?? {})) if (typeof v === 'string') out[k] = v;
    tables[lang] = out;
  }
  const table = (lang: string): Record<string, string> => tables[lang] ?? {};
  for (const lang of langs) {
    const parsed = I18nFileSchema.safeParse(i18n[lang]);
    if (!parsed.success)
      add(`i18n/${lang}.json`, '-', 'schema', parsed.error.issues[0]?.message ?? 'invalid i18n file');
  }
  const required = new Set(input.requiredLanguages ?? ['en', 'hi']);
  for (const lang of required) {
    if (!langs.includes(lang)) add(`i18n/${lang}.json`, '-', 'missing_language', `i18n/${lang}.json is required`);
  }

  const isDraftLang = (lang: string) => {
    const meta = i18n[lang]?._meta;
    return isRecord(meta) && meta.status === 'machine_draft';
  };
  const severityFor = (lang: string): Issue['severity'] =>
    required.has(lang) || !isDraftLang(lang) ? 'error' : 'warning';
  const reference = required.has('en') ? 'en' : (langs[0] ?? 'en');

  // Glossary words per language, so an article body's length counts what the reader sees.
  const glossaryItems = items.filter((i) => i.kind === 'glossary');
  const termIds = new Set(glossaryItems.map((g) => g.id));
  const wordsIn = (lang: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const g of glossaryItems) {
      const word = typeof g.data.word === 'string' ? table(lang)[g.data.word.slice(2)] : undefined;
      if (word !== undefined) out[g.id] = word;
    }
    return out;
  };

  /** Checks one text. `relaxed` is for Scam or Safe? message bodies, which quote a scammer on purpose. */
  const checkText = (
    file: string,
    id: string,
    lang: string,
    key: string,
    text: string,
    ctx: { investing: boolean; relaxed: boolean },
  ) => {
    const where = `${lang}:${key}`;
    const sev = severityFor(lang);
    const stripped = stripPunctuation(normalizeText(text));

    // Rule 3: real brands anywhere, promises and pushy advice outside scam bodies.
    const brand = findTerm(stripped, brands);
    if (brand) add(file, id, 'real_brand', `${where} names "${brand}". Use fictional names only.`, sev);
    if (!ctx.relaxed) {
      const promise = findTerm(stripped, promises);
      if (promise) add(file, id, 'promise', `${where} uses "${promise}". Educate, never promise or recommend.`, sev);
      const push = findImperativeAdvice(text, guardrails.fictionalAssets);
      if (push)
        add(
          file,
          id,
          'advice',
          `${where} tells the reader to invest or buy ("${push}"). Explain, never recommend.`,
          sev,
        );
    }
    const shame = findTerm(stripped, shaming);
    if (shame) add(file, id, 'tone', `${where} uses "${shame}". Avoid shaming words.`, 'warning');

    // Rule 6: only the safe outside references. Scam bodies may also use reserved fake domains and numbers.
    const okDomains = ctx.relaxed ? [...guardrails.allowedLinks, ...placeholderDomains] : guardrails.allowedLinks;
    for (const link of findLinks(text)) {
      if (!hostAllowed(linkHost(link), okDomains)) {
        const hint = ctx.relaxed
          ? ` Scam messages may use a reserved fake domain (${placeholderDomains.map((d) => `*.${d}`).join(', ')}).`
          : '';
        add(
          file,
          id,
          'link',
          `${where} links to "${link}". Only ${guardrails.allowedLinks.join(', ')} is allowed.${hint}`,
          sev,
        );
      }
    }
    for (const num of findPhoneNumbers(text)) {
      const digits = digitsOf(num);
      if (!allowedNumbers.has(digits) && !(ctx.relaxed && placeholderNumbers.has(digits))) {
        add(
          file,
          id,
          'phone',
          `${where} has the number "${num.trim()}". Only ${guardrails.allowedNumbers.join(', ')} is allowed.`,
          sev,
        );
      }
    }

    // Rules 4 and 5: investing cards name only fictional assets and show ranges, never one number.
    if (ctx.investing) {
      const real = findTerm(stripped, investingTerms);
      if (real && real !== brand) {
        add(
          file,
          id,
          'real_product',
          `${where} names "${real}". Investing cards may only use ${guardrails.fictionalAssets.join(', ')}.`,
          sev,
        );
      }
      if (countPercentages(text) === 1) {
        add(file, id, 'single_number', `${where} quotes a single percentage. Show a range of outcomes instead.`, sev);
      }
      const single = findSingleRupeeProjection(text);
      if (single) {
        add(
          file,
          id,
          'single_number',
          `${where} projects one ₹ outcome ("${single}"). Show a range (low to high) instead.`,
          sev,
        );
      }
    }

    // Rule 7: length caps in every language, counted in visible characters.
    const cap = capFor(key);
    const limit = cap ? guardrails.lengthCaps[cap] : undefined;
    const length = visibleLength(cap === 'articleBody' ? renderMarkers(text, wordsIn(lang)) : text);
    if (cap && limit !== undefined && length > limit) {
      add(file, id, 'length', `${where} is ${length} characters; the ${cap} cap is ${limit}.`, sev);
    }

    // Interpolation: the same {{placeholders}} as the reference language, so the UI fills them all.
    if (lang !== reference) {
      const ref = table(reference)[key];
      if (ref !== undefined && placeholdersOf(ref).join(',') !== placeholdersOf(text).join(',')) {
        add(
          file,
          id,
          'placeholders',
          `${where} has placeholders {${placeholdersOf(text).join(', ')}} but ${reference} has {${placeholdersOf(ref).join(', ')}}`,
          sev,
        );
      }
    }
  };

  /** An article's [[termId]] markers: well formed, in the glossary, equal to `terms`, the same in every language. */
  const checkArticleTerms = (item: Item) => {
    const body = item.data.body;
    if (typeof body !== 'string' || !body.startsWith('t:')) return;
    const bodyKey = body.slice(2);
    const refText = table(reference)[bodyKey];
    const refMarkers = refText === undefined ? null : termMarkers(refText);
    const sameSet = (a: string[], b: string[]) => [...new Set(a)].sort().join(',') === [...new Set(b)].sort().join(',');
    for (const lang of langs) {
      const text = table(lang)[bodyKey];
      if (text === undefined) continue;
      const where = `${lang}:${bodyKey}`;
      const sev = severityFor(lang);
      for (const bad of malformedMarkers(text)) {
        add(
          item.file,
          item.id,
          'term_marker',
          `${where} has "${bad}". Write markers as [[termId]] with a glossary id.`,
          sev,
        );
      }
      const marks = termMarkers(text);
      for (const id of marks) {
        if (!termIds.has(id))
          add(item.file, item.id, 'unknown_term', `${where} marks [[${id}]], which is not in glossary.json`, sev);
      }
      if (lang !== reference && refMarkers && !sameSet(marks, refMarkers)) {
        add(
          item.file,
          item.id,
          'term_markers',
          `${where} marks [${marks.join(', ')}] but ${reference} marks [${refMarkers.join(', ')}]`,
          sev,
        );
      }
    }
    const terms = Array.isArray(item.data.terms)
      ? item.data.terms.filter((t): t is string => typeof t === 'string')
      : [];
    if (refMarkers && !sameSet(terms, refMarkers)) {
      add(
        item.file,
        item.id,
        'article_terms',
        `terms [${terms.join(', ')}] must equal the [[termId]] markers in the ${reference} body [${refMarkers.join(', ')}]`,
      );
    }
    if (new Set(terms).size !== terms.length) add(item.file, item.id, 'article_terms', 'terms lists an id twice');
  };

  const usedKeys = new Set<string>();
  for (const item of items) {
    const keys = [...collectKeys(item.data)];
    for (const k of keys) usedKeys.add(k);
    const investing = item.data.pillar === 'understand_investing';
    // Only the message bodies of Scam or Safe? cards are relaxed; sender, hints and explanation get full checks.
    const scamBodies = new Set<string>();
    if (item.kind === 'scam' && Array.isArray(item.data.segments)) {
      for (const seg of item.data.segments)
        if (isRecord(seg) && typeof seg.text === 'string' && seg.text.startsWith('t:'))
          scamBodies.add(seg.text.slice(2));
    }

    // ---- Rule 2: every key exists in en and hi (and any other language file present) -------
    for (const lang of langs) {
      const t = table(lang);
      for (const key of keys) {
        const text = t[key];
        if (text === undefined || text.trim() === '') {
          add(item.file, item.id, 'missing_key', `${lang} is missing "${key}"`, severityFor(lang));
        }
      }
    }

    // ---- Rule 5: investing needs the assumption banner -------------------------------------
    if (investing && (item.kind === 'scenario' || item.kind === 'event') && item.data.assumption !== true) {
      add(
        item.file,
        item.id,
        'assumption_banner',
        'investing cards must set "assumption": true so the app shows AssumptionBanner',
      );
    }

    // ---- Rules 3, 4, 6, 7: text checks in every language -----------------------------------
    for (const lang of langs) {
      const t = table(lang);
      for (const key of keys) {
        const text = t[key];
        if (text === undefined) continue;
        checkText(item.file, item.id, lang, key, text, { investing, relaxed: scamBodies.has(key) });
      }
    }

    // ---- Rule 1: every [[termId]] is in the glossary; terms and markers agree --------------
    if (item.kind === 'article') checkArticleTerms(item);

    // ---- Rule 8: strict mode fails on drafts and on articles nobody fact-checked ----------
    const meta = item.data.meta;
    if (opts.strict && isRecord(meta) && meta.status === 'draft') {
      add(item.file, item.id, 'draft', 'status is "draft". A human must review it and set "reviewed".');
    }
    const checkedBy = isRecord(meta) ? meta.factsCheckedBy : undefined;
    if (opts.strict && item.kind === 'article' && !(typeof checkedBy === 'string' && checkedBy.trim())) {
      add(
        item.file,
        item.id,
        'facts_unchecked',
        'meta.factsCheckedBy is missing. A human must check every real figure first.',
      );
    }
  }

  // ---- Strings no item references (reflections, buttons, banner): same text checks ---------
  for (const lang of langs) {
    for (const [key, text] of Object.entries(table(lang))) {
      if (usedKeys.has(key)) continue;
      checkText(`i18n/${lang}.json`, key, lang, key, text, { investing: false, relaxed: false });
    }
  }

  return issues;
}
