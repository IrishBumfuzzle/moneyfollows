/** Error codes the backend raises (see supabase/migrations). UI maps them to t: keys. */
export type ApiErrorCode =
  | 'class_not_found'
  | 'class_full'
  | 'class_closed'
  | 'join_rate_limited'
  | 'nickname_taken'
  | 'nickname_blocked'
  | 'nickname_invalid'
  | 'nickname_personal_info'
  | 'rejoin_failed'
  | 'too_many_events'
  | 'not_signed_in'
  /** Staff sign-in (additive): wrong or expired email code, or wrong demo password. */
  | 'auth_code_invalid'
  /** Staff sign-in (additive): too many codes requested; wait and try again. */
  | 'auth_rate_limited'
  /** Staff sign-in (additive): the email has no accepted invite (sign-up is off). */
  | 'auth_not_invited'
  | 'network'
  | 'timeout'
  | 'unknown';

const KNOWN = new Set<string>([
  'class_not_found',
  'class_full',
  'class_closed',
  'join_rate_limited',
  'nickname_taken',
  'nickname_blocked',
  'nickname_invalid',
  'nickname_personal_info',
  'rejoin_failed',
  'too_many_events',
]);

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
    /** HTTP status, when the server answered (additive). */
    readonly status?: number,
    /** nickname_taken only: up to 3 free nicknames the server suggests (additive). */
    readonly suggestions?: string[],
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

/** Turns a Supabase/PostgREST error into an ApiError with a stable code. */
export function toApiError(
  err: { message?: string; code?: string; details?: string | null } | null | undefined,
  status?: number,
): ApiError {
  const message = err?.message ?? '';
  // PostgREST maps the PTxxx codes our SQL raises to that HTTP status.
  const pt = /^PT(\d{3})$/.exec(err?.code ?? '');
  const httpStatus = status || (pt ? Number(pt[1]) : undefined);
  if (message === 'nickname_taken') {
    return new ApiError('nickname_taken', undefined, httpStatus, parseSuggestions(err?.details));
  }
  if (KNOWN.has(message)) return new ApiError(message as ApiErrorCode, undefined, httpStatus);
  if (/fetch|network|Failed to fetch|Load failed/i.test(message)) return new ApiError('network', message);
  if (/abort/i.test(message)) return new ApiError('timeout', message);
  return new ApiError('unknown', message || 'unknown error', httpStatus);
}

/**
 * Turns a supabase-js auth error (sign-in, code check) into an ApiError the dashboard can explain.
 * GoTrue sends a stable `code` on newer servers; the message checks cover older ones.
 */
export function toAuthError(err: { message?: string; code?: string; status?: number } | null | undefined): ApiError {
  const message = err?.message ?? '';
  const code = err?.code ?? '';
  const status = err?.status || undefined;
  if (code === 'otp_expired' || code === 'invalid_credentials' || /token has expired|invalid login credentials/i.test(message)) {
    return new ApiError('auth_code_invalid', message, status);
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return new ApiError('auth_rate_limited', message, status);
  }
  if (code === 'signup_disabled' || code === 'user_not_found' || code === 'otp_disabled' || /signups not allowed/i.test(message)) {
    return new ApiError('auth_not_invited', message, status);
  }
  if (!status && /fetch|network|Load failed/i.test(message)) return new ApiError('network', message);
  return new ApiError('unknown', message || 'unknown error', status);
}

/** join_class puts a JSON array of nicknames in the error's detail. Anything else gives undefined. */
function parseSuggestions(details: string | null | undefined): string[] | undefined {
  if (typeof details !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(details);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a failed push is worth retrying later: network errors, timeouts, 5xx,
 * 408 and 429 are. A known code (class_closed, rejoin_failed, too_many_events) is
 * the server's own answer and is permanent. An unknown 4xx is retried, except 400,
 * 413 and 422, because it comes from something in between and not from bad events:
 * a school's filtering proxy (403/407), an expired key (401), or a function missing
 * right after a migration (404). Dead-lettering on those would drop a whole
 * offline backlog. Errors that are not ApiErrors (a thrown TypeError from fetch,
 * say) are treated as network errors.
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.code === 'network' || err.code === 'timeout') return true;
  if (err.status !== undefined && err.status > 0) {
    if (err.status >= 500 || err.status === 429 || err.status === 408) return true;
    return err.code === 'unknown' && !PERMANENT_STATUS.has(err.status);
  }
  // A known code without a status is a validation error; anything else unclassified is retried.
  return err.code === 'unknown';
}

/** The request itself is malformed: sending it again can't help. */
const PERMANENT_STATUS = new Set([400, 413, 422]);
