/** Error codes the backend raises (see supabase/migrations). UI maps them to t: keys. */
export type ApiErrorCode =
  | 'class_not_found'
  | 'nickname_taken'
  | 'nickname_blocked'
  | 'nickname_invalid'
  | 'nickname_personal_info'
  | 'too_many_events'
  | 'not_signed_in'
  | 'network'
  | 'unknown';

const KNOWN = new Set<string>([
  'class_not_found',
  'nickname_taken',
  'nickname_blocked',
  'nickname_invalid',
  'nickname_personal_info',
  'too_many_events',
]);

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

/** Turns a Supabase/PostgREST error into an ApiError with a stable code. */
export function toApiError(err: { message?: string; code?: string } | null | undefined): ApiError {
  const message = err?.message ?? '';
  if (KNOWN.has(message)) return new ApiError(message as ApiErrorCode);
  if (/fetch|network|Failed to fetch|Load failed/i.test(message)) return new ApiError('network', message);
  return new ApiError('unknown', message || 'unknown error');
}
