// Pure helpers for the Progress screen (kept out of the .tsx so they run in node tests).
import { GAME_MONTHS, WEEKS_PER_MONTH, type ClassProgressRow } from '@paisa/shared';
import { daysSince } from '../../format';

/** A full game is 3 in-game months of 4 weeks. */
export const GAME_WEEKS = GAME_MONTHS * WEEKS_PER_MONTH;
/** A student quiet for this many days (or never seen) is flagged for a nudge. */
export const INACTIVE_DAYS = 7;

export type SortKey =
  | 'nickname'
  | 'persona'
  | 'lang'
  | 'last_active'
  | 'modules_done'
  | 'weeks_played'
  | 'decisions'
  | 'news_editions'
  | 'classroom_best'
  | 'baseline_score'
  | 'endline_score';
export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** Column order in the table; the header labels live in content as `col.<key>`. */
export const COLUMNS: readonly SortKey[] = [
  'nickname',
  'persona',
  'lang',
  'last_active',
  'modules_done',
  'weeks_played',
  'decisions',
  'news_editions',
  'classroom_best',
  'baseline_score',
  'endline_score',
];

export const DEFAULT_SORT: SortState = { key: 'nickname', dir: 'asc' };

const TEXT_KEYS = new Set<SortKey>(['nickname', 'persona', 'lang']);

/** Text columns are numeric-aware and ignore case, so "Kite2" sorts before "Kite10". */
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Which way the first click on a column sorts: A to Z for text, longest-absent first for
 * "last active" (who needs a nudge), highest first for numbers.
 */
export function firstDir(key: SortKey): SortDir {
  return TEXT_KEYS.has(key) || key === 'last_active' ? 'asc' : 'desc';
}

/** Clicking the sorted column flips it; clicking another starts at its first direction. */
export function nextSort(current: SortState, key: SortKey): SortState {
  return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir(key) };
}

function valueOf(row: ClassProgressRow, key: SortKey): string | number | null {
  switch (key) {
    case 'last_active': {
      const t = row.last_active ? Date.parse(row.last_active) : NaN;
      return Number.isNaN(t) ? null : t;
    }
    case 'nickname':
    case 'persona':
    case 'lang':
      return row[key] || null;
    default:
      return row[key];
  }
}

/** Compares two rows for a sort. Missing values go last in both directions; ties fall back to nickname. */
export function compareRows({ key, dir }: SortState) {
  const sign = dir === 'asc' ? 1 : -1;
  return (a: ClassProgressRow, b: ClassProgressRow): number => {
    const va = valueOf(a, key);
    const vb = valueOf(b, key);
    if (va === null && vb !== null) return 1;
    if (va !== null && vb === null) return -1;
    if (va !== null && vb !== null) {
      const c = typeof va === 'string' && typeof vb === 'string' ? collator.compare(va, vb) : Number(va) - Number(vb);
      if (c !== 0) return c * sign;
    }
    return collator.compare(a.nickname, b.nickname) || a.anon_id.localeCompare(b.anon_id);
  };
}

/** A sorted copy; the input is left alone. */
export function sortRows(rows: readonly ClassProgressRow[], sort: SortState): ClassProgressRow[] {
  return [...rows].sort(compareRows(sort));
}

/** Rows whose nickname contains the query (case-insensitive, surrounding spaces ignored). */
export function filterRows(rows: readonly ClassProgressRow[], query: string): ClassProgressRow[] {
  const q = query.trim().toLocaleLowerCase();
  return q ? rows.filter((r) => r.nickname.toLocaleLowerCase().includes(q)) : [...rows];
}

/** Quiet for INACTIVE_DAYS or more, or never active at all. */
export function isInactive(lastActive: string | null | undefined, now: Date = new Date()): boolean {
  const d = daysSince(lastActive, now);
  return d === null || d >= INACTIVE_DAYS;
}

export interface Summary {
  total: number;
  inactive: number;
  /** Students with an end-line score. */
  endline: number;
}

export function summarize(rows: readonly ClassProgressRow[], now: Date = new Date()): Summary {
  return {
    total: rows.length,
    inactive: rows.filter((r) => isInactive(r.last_active, now)).length,
    endline: rows.filter((r) => r.endline_score !== null).length,
  };
}

/** Persona ids the dashboard has a name for; anything else shows as it came. */
const KNOWN_PERSONAS = new Set(['sana', 'ravi']);

/** Content key for a persona's name, or null when there is none to translate. */
export function personaKey(persona: string | null): string | null {
  return persona && KNOWN_PERSONAS.has(persona) ? `persona.${persona}` : null;
}

export type LoadErrorKey = 'error.network' | 'error.signin' | 'error.other';

/** Picks a friendly message for a failed load (ApiError, read by shape so tests need no client). */
export function loadErrorKey(err: unknown): LoadErrorKey {
  const { code, status } = (err ?? {}) as { code?: unknown; status?: unknown };
  if (code === 'network' || code === 'timeout') return 'error.network';
  if (code === 'not_signed_in' || status === 401) return 'error.signin';
  return 'error.other';
}
