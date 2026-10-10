/** Error codes the backend raises (see supabase/migrations). UI maps them to t: keys. */
export type ApiErrorCode =
  | 'class_not_found'
  | 'class_full'
  | 'join_rate_limited'
  | 'nickname_taken'
  | 'nickname_blocked'
  | 'nickname_invalid'
  | 'nickname_personal_info'
  | 'too_many_events'
  | 'not_signed_in'
  | 'network'
  | 'timeout'
  | 'unknown';

const KNOWN = new Set<string>([
  'class_not_found',
  'class_full',
  'join_rate_limited',
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
    /** HTTP status, when the server answered (additive). */
    readonly status?: number,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

/** Turns a Supabase/PostgREST error into an ApiError with a stable code. */
export function toApiError(err: { message?: string; code?: string } | null | undefined, status?: number): ApiError {
  const message = err?.message ?? '';
  // PostgREST maps the PTxxx codes our SQL raises to that HTTP status.
  const pt = /^PT(\d{3})$/.exec(err?.code ?? '');
  const httpStatus = status || (pt ? Number(pt[1]) : undefined);
  if (KNOWN.has(message)) return new ApiError(message as ApiErrorCode, undefined, httpStatus);
  if (/fetch|network|Failed to fetch|Load failed/i.test(message)) return new ApiError('network', message);
  if (/abort/i.test(message)) return new ApiError('timeout', message);
  return new ApiError('unknown', message || 'unknown error', httpStatus);
}

/**
 * Whether a failed push is worth retrying later: network errors, timeouts, 5xx,
 * 408 and 429 are; any other 4xx or a validation error (e.g. too_many_events) is
 * permanent. Errors that are not ApiErrors (a thrown TypeError from fetch, say)
 * are treated as network errors.
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.code === 'network' || err.code === 'timeout') return true;
  if (err.status !== undefined && err.status > 0) {
    return err.status >= 500 || err.status === 429 || err.status === 408;
  }
  // A known code without a status is a validation error; anything else unclassified is retried.
  return err.code === 'unknown';
}
