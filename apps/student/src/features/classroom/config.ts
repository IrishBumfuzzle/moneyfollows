// How a classroom round is set up: how many questions and which pillars. The facilitator sets it
// for the class (API.md §5.5, proposed); the app reads it from class_status, keeps the last value
// it saw for offline play, and falls back to 5 questions across all four pillars.
import { PILLARS } from '@paisa/shared';
import type { Pillar, QuizQuestion } from '@paisa/shared';
import { get, set } from 'idb-keyval';
import { api } from '../../api/client';

export interface ClassroomConfig {
  count: number;           // questions per round
  pillars?: Pillar[];      // only these pillars; absent = all four
}

export const DEFAULT_CLASSROOM: ClassroomConfig = { count: 5 };
export const MIN_QUESTIONS = 1;
/** A slow network never holds up the classroom longer than this; the saved setup is used instead. */
export const CONFIG_TIMEOUT_MS = 1500;

const CACHE_KEY = 'paisa.classroom.config';

/**
 * Makes any server value safe to play: unknown pillars are dropped, an empty pillar list means
 * all four, and the count is clamped to what the bank has for those pillars. Never throws.
 */
export function normalizeConfig(raw: unknown, bank: readonly QuizQuestion[]): ClassroomConfig {
  const r = (raw ?? {}) as { count?: unknown; pillars?: unknown };
  const pillars = Array.isArray(r.pillars) ? r.pillars.filter((p): p is Pillar => PILLARS.includes(p as Pillar)) : [];
  const usable = pillars.length ? bank.filter((q) => pillars.includes(q.pillar)) : bank;
  // A pillar list with no questions behind it would leave nothing to play: use all pillars.
  const pool = usable.length ? usable : bank;
  const wanted = typeof r.count === 'number' && Number.isFinite(r.count) ? Math.round(r.count) : DEFAULT_CLASSROOM.count;
  const count = Math.max(MIN_QUESTIONS, Math.min(wanted, pool.length));
  return usable.length && pillars.length ? { count, pillars } : { count };
}

/** The class's classroom setup: from the server when online, else the last one saved, else the default. */
export async function loadClassroomConfig(
  student: { anonId: string; classId: string },
  bank: readonly QuizQuestion[],
): Promise<ClassroomConfig> {
  if (api) {
    try {
      // `classroom` is the proposed additive field on class_status (API.md §5.5); absent today.
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CONFIG_TIMEOUT_MS));
      const status = (await Promise.race([api.classStatus(student.anonId, student.classId), timeout])) as { classroom?: unknown };
      if (status.classroom !== undefined) {
        const cfg = normalizeConfig(status.classroom, bank);
        await set(CACHE_KEY, cfg).catch(() => {});
        return cfg;
      }
    } catch {
      /* offline or no such class: use the saved or default setup */
    }
  }
  try {
    const saved = await get<unknown>(CACHE_KEY);
    if (saved) return normalizeConfig(saved, bank);
  } catch {
    /* storage blocked */
  }
  return normalizeConfig(DEFAULT_CLASSROOM, bank);
}
