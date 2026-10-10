// Paisa Times content. `pack/` is a copy of BE-1's content pack on origin/Backend
// (packages/content/news/2026-W41.json, glossary.json and their news.* / glossary.* strings),
// keys unchanged. When packages/content is on main, point getEdition() and the glossary at it
// and delete pack/; nothing else changes.
import edition from './pack/2026-W41.json';
import glossary from './pack/glossary.json';
import packEn from './pack/en.json';
import packHi from './pack/hi.json';
import en from './en.json';
import hi from './hi.json';
import type { Article, Edition, GlossaryTerm, Lang, TKey } from '../types';

export const CONTENT_VERSION = 'news-2026-W41';

export const STRINGS: Partial<Record<Lang, Record<string, string>>> = {
  en: { ...packEn, ...en },
  hi: { ...packHi, ...hi },
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

const ARTICLES = edition as Article[];
const EDITION: Edition = { id: ARTICLES[0].edition, articles: ARTICLES };
const GLOSSARY = new Map((glossary as GlossaryTerm[]).map((g) => [g.id, g]));

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
