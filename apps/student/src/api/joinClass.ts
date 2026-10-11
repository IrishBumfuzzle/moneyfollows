// join_class and rejoin_class (CLAUDE.md 5.5) through the api-client. Onboarding only sees
// JoinResult and JoinError, never ApiError. With no backend configured, joinClass falls back to
// an offline stand-in so the app still runs in local dev.
import { ApiError } from '@paisa/api-client';
import type { Lang } from '@paisa/shared';
import { backendConfigured, loadApi } from './backend';

export interface JoinResult {
  anon_id: string;
  class_id: string;
  /** The class's default language (the student's own choice stays in the profile). */
  default_lang: Lang;
  /** Whether the teacher has opened the end-line quiz. */
  endline_open: boolean;
  /** 6-character code that gets this student back on a new phone; null in offline stand-in mode. */
  rejoin_code: string | null;
  /** True when no backend is configured and the ids are made on the phone (local dev only). */
  offline?: boolean;
}

/** Errors the UI turns into friendly messages. */
export type JoinErrorCode =
  | 'class_not_found'
  | 'class_closed'
  | 'class_full'
  | 'rate_limited'
  | 'nickname_taken'
  | 'nickname_blocked'
  | 'nickname_invalid'
  | 'nickname_personal_info'
  | 'rejoin_failed'
  | 'offline'
  | 'unknown';

export class JoinError extends Error {
  constructor(
    readonly code: JoinErrorCode,
    /** nickname_taken only: up to 3 free nicknames the server suggests (may be empty). */
    readonly suggestions: string[] = [],
  ) {
    super(code);
    this.name = 'JoinError';
  }
}

/** Maps the api-client's error codes onto the ones onboarding explains. */
export function toJoinError(err: unknown): JoinError {
  if (err instanceof JoinError) return err;
  if (!(err instanceof ApiError)) return new JoinError('offline'); // chunk failed to load, fetch threw
  switch (err.code) {
    case 'class_not_found':
    case 'class_closed':
    case 'class_full':
    case 'nickname_blocked':
    case 'nickname_invalid':
    case 'nickname_personal_info':
    case 'rejoin_failed':
      return new JoinError(err.code);
    case 'nickname_taken':
      return new JoinError('nickname_taken', err.suggestions ?? []);
    case 'join_rate_limited':
      return new JoinError('rate_limited');
    case 'network':
    case 'timeout':
      return new JoinError('offline');
    default:
      return new JoinError('unknown');
  }
}

/** Joins the class. `lang` is the language picked in onboarding, saved as the student's. */
export async function joinClass(classCode: string, nickname: string, lang?: Lang): Promise<JoinResult> {
  if (!backendConfigured) return standIn(classCode, nickname);
  try {
    const api = await loadApi();
    if (!api) return standIn(classCode, nickname);
    const r = await api.joinClass(classCode, nickname, lang ? { lang } : undefined);
    return {
      anon_id: r.anon_id,
      class_id: r.class_id,
      default_lang: r.default_lang,
      endline_open: r.endline_open ?? false,
      rejoin_code: r.rejoin_code ?? null,
    };
  } catch (err) {
    throw toJoinError(err);
  }
}

/** Gets an existing student back on a new or reset phone with their rejoin code. Needs the server. */
export async function rejoinClass(classCode: string, nickname: string, rejoinCode: string): Promise<JoinResult> {
  try {
    const api = await loadApi();
    if (!api) throw new JoinError('offline');
    const r = await api.rejoinClass(classCode, nickname, rejoinCode);
    return {
      anon_id: r.anon_id,
      class_id: r.class_id,
      default_lang: r.default_lang,
      endline_open: r.endline_open ?? false,
      rejoin_code: r.rejoin_code ?? rejoinCode.trim().toUpperCase(),
    };
  } catch (err) {
    throw toJoinError(err);
  }
}

async function standIn(classCode: string, nickname: string): Promise<JoinResult> {
  console.warn('[join] no backend configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY): offline stand-in');
  await new Promise((r) => setTimeout(r, 300));
  if (!classCode.trim()) throw new JoinError('class_not_found');
  if (!nickname.trim()) throw new JoinError('nickname_invalid');
  return { anon_id: uuid(), class_id: uuid(), default_lang: 'en', endline_open: false, rejoin_code: null, offline: true };
}

// crypto.randomUUID needs a secure context; a phone on http://192.168.x.x:5173 isn't one.
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
