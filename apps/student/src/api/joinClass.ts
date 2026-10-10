// Stand-in for join_class (CLAUDE.md 5.5). BE-2's api-client replaces this file; keep the
// signature and the JoinError codes so onboarding doesn't change. Any non-empty code works.
import type { Lang } from '../features/onboarding/types';

export interface JoinResult {
  anon_id: string;
  class_id: string;
  default_lang: Lang;
}

/** Errors the UI turns into friendly messages. Anything else is shown as a generic "try again". */
export type JoinErrorCode = 'class_not_found' | 'nickname_rejected';

export class JoinError extends Error {
  constructor(readonly code: JoinErrorCode) {
    super(code);
    this.name = 'JoinError';
  }
}

export async function joinClass(classCode: string, nickname: string): Promise<JoinResult> {
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
