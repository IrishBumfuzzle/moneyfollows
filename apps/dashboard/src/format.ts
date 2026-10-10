import type { Lang } from './i18n';

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

/** Whole numbers with Indian grouping in every language (CLAUDE.md 5.7). */
export const formatNumber = (n: number) => new Intl.NumberFormat('en-IN').format(n);

/** 0–100 score as "72%"; null as an en dash. */
export const formatPct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${Math.round(n)}%`);

export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' });
}

/** Whole days since `iso` (0 = today); null when never. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}
