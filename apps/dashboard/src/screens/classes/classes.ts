import type { ClassRow } from '@paisa/api-client';

export const NAME_MAX = 80;

/** What is wrong with a class name, if anything (the database allows 1 to 80 characters). */
export function validateClassName(raw: string): 'empty' | 'long' | null {
  const name = raw.trim();
  if (name.length === 0) return 'empty';
  return [...name].length > NAME_MAX ? 'long' : null;
}

/**
 * New codes are 8 characters; show them as "ABCD EFGH" so they are easy to read out. Students'
 * code box strips spaces, so reading or copying the grouped form works. Other lengths (the demo
 * HYD234) are left alone.
 */
export const formatCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code);

/** A search box appears above the class list once a facilitator has more classes than this. */
export const CLASS_SEARCH_FROM = 6;

/** Classes whose name or code contains the query; case and spaces in a code ("ABCD 2345") don't matter. */
export function filterClasses(list: readonly ClassRow[], query: string): ClassRow[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...list];
  const bare = q.replace(/\s+/g, '');
  return list.filter(
    (c) => c.name.toLocaleLowerCase().includes(q) || (bare && c.class_code.toLowerCase().includes(bare)),
  );
}

/** The fields a settings change may set; the id never changes. */
export type ClassPatch = Partial<Omit<ClassRow, 'id'>>;

/**
 * Merges a patch into the class's latest row. Settings changes arrive after a server round trip,
 * so they must not write back a row copied at click time: that could undo a change another
 * request landed in between.
 */
export function patchClassRow(list: ClassRow[], id: string, patch: ClassPatch): ClassRow[] {
  return list.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

/** Replaces a class with the same id, or adds it; the list stays newest first. */
export function mergeClass(list: ClassRow[], cls: ClassRow): ClassRow[] {
  const next = list.some((c) => c.id === cls.id) ? list.map((c) => (c.id === cls.id ? cls : c)) : [cls, ...list];
  return [...next].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}
