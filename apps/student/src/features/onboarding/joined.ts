import { del, get, set } from 'idb-keyval';
import type { JoinResult } from '../../api/joinClass';
import { AVATARS } from './presets';
import type { Lang } from './types';

const KEY = 'paisa.onboarding.joined';

/** A successful join or rejoin. Onboarding never joins twice, so a second student can't be made by going Back. */
export interface Joined {
  code: string;
  nickname: string;
  result: JoinResult;
  /** True when the student came back with a rejoin code instead of joining new. */
  rejoin?: boolean;
}

/** Joined plus the choices made so far, kept so a reload mid-onboarding resumes instead of re-joining. */
export interface SavedJoin extends Joined {
  lang: Lang;
  avatar: string | null;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** Anything read back from IndexedDB is checked: an old or hand-edited record must not crash onboarding. */
export function isSavedJoin(v: unknown): v is SavedJoin {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  const r = s.result as Record<string, unknown> | null | undefined;
  return (
    isStr(s.code) &&
    isStr(s.nickname) &&
    (s.lang === 'en' || s.lang === 'hi') &&
    (s.avatar === null || AVATARS.some((a) => a.id === s.avatar)) &&
    (s.rejoin === undefined || typeof s.rejoin === 'boolean') &&
    typeof r === 'object' &&
    r !== null &&
    isStr(r.anon_id) &&
    isStr(r.class_id) &&
    isStr(r.default_lang) &&
    typeof r.endline_open === 'boolean' &&
    (r.rejoin_code === null || typeof r.rejoin_code === 'string')
  );
}

/** The join in progress, if the app was closed between joining and finishing onboarding. Never throws. */
export async function loadJoined(): Promise<SavedJoin | undefined> {
  try {
    const s: unknown = await get(KEY);
    return isSavedJoin(s) ? s : undefined;
  } catch {
    return undefined; // IndexedDB unavailable (private mode): onboarding just starts over
  }
}

export async function saveJoined(s: SavedJoin): Promise<void> {
  try {
    await set(KEY, s);
  } catch {
    // IndexedDB unavailable (private mode): the join still counts for this session
  }
}

export async function clearJoined(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    // nothing saved, nothing to clear
  }
}
