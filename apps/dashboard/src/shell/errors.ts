import type { ApiErrorCode } from '@paisa/api-client';

/** The ApiError code of a thrown value, or undefined for anything else. Duck-typed so tests need no client. */
export function apiCode(err: unknown): ApiErrorCode | undefined {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? (code as ApiErrorCode) : undefined;
}

/** Offline, DNS failure or a request that timed out: worth telling staff to check the connection. */
export const isNetworkError = (err: unknown) => {
  const code = apiCode(err);
  return code === 'network' || code === 'timeout';
};
