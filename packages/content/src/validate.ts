// Guardrail linter for content (CLAUDE.md 7.2). A pure library: no file or network access.
// scripts/lint-content.ts reads the files and calls validateContent.
import {
  EventCardSchema,
  I18nFileSchema,
  PersonaSchema,
  QuizQuestionSchema,
  ScamMessageSchema,
  ScenarioSchema,
} from '@paisa/shared';

export interface Guardrails {
  brands: string[];
  promises: string[];
  shaming: string[];
  investingTerms: string[];
  allowedLinks: string[];
  allowedNumbers: string[];
  fictionalAssets: string[];
  lengthCaps: { story: number; label: number; lesson: number; note: number };
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
}

type Kind = 'scenario' | 'event' | 'quiz' | 'scam' | 'persona';

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
} as const;

function kindOf(path: string): Kind | null {
  const parts = path.replace(/\\/g, '/').split('/');
  const base = parts[parts.length - 1] ?? '';
  if (base === 'personas.json') return 'persona';
  if (parts.includes('scenarios')) return 'scenario';
  if (parts.includes('events')) return 'event';
  if (parts.includes('quizzes')) return 'quiz';
  if (parts.includes('minigames')) return 'scam';
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match that also works for Devanagari and other scripts.
const wordRe = (words: string[]) =>
  words.length === 0
    ? null
    : new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'iu');

const LINK_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|net|org|ly|io|co|app|xyz|info)\b(?:\/\S*)?/gi;
const PHONE_RE = /(?:\+91[\s-]?)?\b\d{10}\b|\b1800[\s-]?\d{3}[\s-]?\d{4}\b/g;
const PERCENT_RE = /\d+(?:\.\d+)?\s?%/g;

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

function capFor(key: string): keyof Guardrails['lengthCaps'] | null {
  if (key.endsWith('.story')) return 'story';
  if (key.endsWith('.label')) return 'label';
  if (key.endsWith('.lesson')) return 'lesson';
  if (key.endsWith('.note') || key.endsWith('.later')) return 'note';
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateContent(input: ValidateInput, opts: { strict: boolean }): Issue[] {
  const { guardrails, i18n } = input;
  const issues: Issue[] = [];
  const add = (file: string, id: string, rule: string, message: string, severity: Issue['severity'] = 'error') =>
    issues.push({ file, id, rule, message, severity });

  const brandRe = wordRe(guardrails.brands);
  const promiseRe = wordRe(guardrails.promises);
  const shamingRe = wordRe(guardrails.shaming);
  const investingRe = wordRe(guardrails.investingTerms);

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
        const first = seenIds.get(id);
        if (first) add(file.path, id, 'duplicate_id', `id "${id}" is also used in ${first}`);
        else seenIds.set(id, file.path);
      }
      if (isRecord(raw)) items.push({ kind, file: file.path, id, data: raw });
    });
  }

  // ---- i18n files themselves ---------------------------------------------------------------
  const langs = Object.keys(i18n);
  const table = (lang: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(i18n[lang] ?? {})) if (typeof v === 'string') out[k] = v;
    return out;
  };
  for (const lang of langs) {
    const parsed = I18nFileSchema.safeParse(i18n[lang]);
    if (!parsed.success)
      add(`i18n/${lang}.json`, '-', 'schema', parsed.error.issues[0]?.message ?? 'invalid i18n file');
  }
  for (const required of ['en', 'hi']) {
    if (!langs.includes(required))
      add(`i18n/${required}.json`, '-', 'missing_language', `i18n/${required}.json is required`);
  }

  const isDraftLang = (lang: string) => {
    const meta = i18n[lang]?._meta;
    return isRecord(meta) && meta.status === 'machine_draft';
  };
  const severityFor = (lang: string): Issue['severity'] =>
    lang === 'en' || lang === 'hi' || !isDraftLang(lang) ? 'error' : 'warning';

  for (const item of items) {
    const keys = [...collectKeys(item.data)];
    const investing = item.data.pillar === 'understand_investing';
    const isScam = item.kind === 'scam';

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
      const sev = severityFor(lang);
      for (const key of keys) {
        const text = t[key];
        if (text === undefined) continue;
        const where = `${lang}:${key}`;
        const flagged = new Set<string>();

        const brand = brandRe ? text.match(brandRe) : null;
        if (brand?.[1]) {
          flagged.add(brand[1].toLowerCase());
          add(item.file, item.id, 'real_brand', `${where} names "${brand[1]}". Use fictional names only.`, sev);
        }
        // Scam messages quote the scammer's hook on purpose, so promises, links and numbers are fine there.
        const promise = !isScam && promiseRe ? text.match(promiseRe) : null;
        if (promise?.[1])
          add(
            item.file,
            item.id,
            'promise',
            `${where} uses "${promise[1]}". Educate, never promise or recommend.`,
            sev,
          );
        const shame = shamingRe ? text.match(shamingRe) : null;
        if (shame?.[1]) add(item.file, item.id, 'tone', `${where} uses "${shame[1]}". Avoid shaming words.`, 'warning');

        if (!isScam) {
          for (const link of text.match(LINK_RE) ?? []) {
            if (!guardrails.allowedLinks.some((ok) => link.toLowerCase().includes(ok.toLowerCase()))) {
              add(
                item.file,
                item.id,
                'link',
                `${where} links to "${link}". Only ${guardrails.allowedLinks.join(', ')} is allowed.`,
                sev,
              );
            }
          }
          for (const num of text.match(PHONE_RE) ?? []) {
            if (!guardrails.allowedNumbers.includes(num)) {
              add(
                item.file,
                item.id,
                'phone',
                `${where} has the number "${num}". Only ${guardrails.allowedNumbers.join(', ')} is allowed.`,
                sev,
              );
            }
          }
        }

        if (investing) {
          const real = investingRe ? text.match(investingRe) : null;
          if (real?.[1] && !flagged.has(real[1].toLowerCase())) {
            add(
              item.file,
              item.id,
              'real_product',
              `${where} names "${real[1]}". Investing cards may only use ${guardrails.fictionalAssets.join(', ')}.`,
              sev,
            );
          }
          if ((text.match(PERCENT_RE) ?? []).length === 1) {
            add(
              item.file,
              item.id,
              'single_number',
              `${where} quotes a single percentage. Show a range of outcomes instead.`,
              sev,
            );
          }
        }

        // ---- Rule 7: length caps on English text -------------------------------------------
        const cap = lang === 'en' ? capFor(key) : null;
        if (cap && text.length > guardrails.lengthCaps[cap]) {
          add(
            item.file,
            item.id,
            'length',
            `${where} is ${text.length} characters; the ${cap} cap is ${guardrails.lengthCaps[cap]}.`,
          );
        }
      }
    }

    // ---- Rule 8: strict mode fails on drafts -----------------------------------------------
    const meta = item.data.meta;
    if (opts.strict && isRecord(meta) && meta.status === 'draft') {
      add(item.file, item.id, 'draft', 'status is "draft". A human must review it and set "reviewed".');
    }
  }

  return issues;
}
