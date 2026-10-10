// join_class (CLAUDE.md 5.5) through the api-client. Without a backend configured (src/api/client.ts)
// it falls back to a stand-in that accepts any non-empty code, so the offline demo still onboards.
// Onboarding only sees JoinResult and the JoinError codes below.
import { ApiError } from '@paisa/api-client';
import type { Lang } from '@paisa/shared';
import { api } from './client';

export interface JoinResult {
  anon_id: string;
  class_id: string;
  default_lang: Lang;
  rejoin_code?: string;
  endline_open?: boolean;
}

/** Errors the UI turns into friendly messages. Anything else is shown as a generic "try again". */
export type JoinErrorCode = 'class_not_found' | 'class_closed' | 'nickname_taken' | 'nickname_rejected' | 'busy';

export class JoinError extends Error {
  constructor(readonly code: JoinErrorCode) {
    super(code);
    this.name = 'JoinError';
  }
}

/** api-client error code → what onboarding can explain. Network and unknown errors stay generic. */
export function toJoinError(err: unknown): unknown {
  if (!(err instanceof ApiError)) return err;
  switch (err.code) {
    case 'class_not_found':
      return new JoinError('class_not_found');
    case 'class_closed':
    case 'class_full':
      return new JoinError('class_closed');
    case 'nickname_taken':
      return new JoinError('nickname_taken');
    case 'nickname_blocked':
    case 'nickname_invalid':
    case 'nickname_personal_info':
      return new JoinError('nickname_rejected');
    case 'join_rate_limited':
      return new JoinError('busy');
    default:
      return err;
  }
}

export async function joinClass(classCode: string, nickname: string, lang?: Lang): Promise<JoinResult> {
  if (api) {
    try {
      return await api.joinClass(classCode, nickname, lang ? { lang } : undefined);
    } catch (err) {
      throw toJoinError(err);
    }
  }
  await new Promise((r) => setTimeout(r, 300)); // feels like a network call
  if (!classCode.trim()) throw new JoinError('class_not_found');
  if (!nickname.trim()) throw new JoinError('nickname_rejected');
  return { anon_id: uuid(), class_id: uuid(), default_lang: 'en' };
}

// crypto.randomUUID needs a secure context; a phone on http://192.168.x.x:5173 isn't one.
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
