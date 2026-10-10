// Paisa Times content comes from BE-1's content pack (@paisa/content): the edition, the
// glossary and their news.* / glossary.* strings. Only the reader's own UI strings live here.
import { glossary, i18n, news } from '@paisa/content';
import en from './en.json';
import hi from './hi.json';
import type { Article, Edition, GlossaryTerm, Lang, TKey } from '../types';

export { CONTENT_VERSION } from '@paisa/content';

const pack = i18n as Partial<Record<Lang, Record<string, string>>>;

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = {
  en: { ...pack.en, ...en },
  hi: { ...pack.hi, ...hi },
};

/** Resolves a `t:` key (or bare key) with {{var}} substitution; falls back to English, then the key. */
export function t(lang: Lang, key: TKey | string, vars: Record<string, string | number> = {}): string {
  const k = key.startsWith('t:') ? key.slice(2) : key;
  const s = STRINGS[lang]?.[k] ?? STRINGS.en?.[k] ?? k;
  return s.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
}

const INR = new Intl.NumberFormat('en-IN');
/** ₹ with Indian grouping in every language (CLAUDE.md 5.7). */
export const formatRupees = (n: number) => `₹${INR.format(n)}`;

// The newest edition in the pack is the current one (edition ids sort by ISO week).
const EDITION_ID = [...new Set(news.map((a: Article) => a.edition))].sort().at(-1) ?? '';
const EDITION: Edition = { id: EDITION_ID, articles: news.filter((a: Article) => a.edition === EDITION_ID) };
const GLOSSARY = new Map(glossary.map((g: GlossaryTerm) => [g.id, g]));

/** The current edition. The only place that knows where articles come from. */
export function getEdition(): Edition {
  return EDITION;
}

export function getTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY.get(id);
}

/** Monday of an ISO week id like "2026-W41", as a UTC date. */
export function editionMonday(id: string): Date {
  const [y, w] = id.split('-W').map(Number);
  const jan4 = Date.UTC(y, 0, 4);
  const offset = (new Date(jan4).getUTCDay() + 6) % 7; // days since Monday
  return new Date(jan4 + ((w - 1) * 7 - offset) * 86_400_000);
}

/** "Week 41 · 5 October 2026" (or the Hindi equivalent). */
export function editionLabel(lang: Lang, id: string): string {
  const date = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(editionMonday(id));
  return t(lang, 'news.ui.edition', { week: Number(id.split('-W')[1]), date });
}
