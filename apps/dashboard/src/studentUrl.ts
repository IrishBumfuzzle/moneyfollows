const DEV_STUDENT_URL = 'http://localhost:5173';

/**
 * The student app's address for join links, without a trailing slash. Only a local dev server may
 * fall back to localhost; a production build without VITE_STUDENT_URL has no address (empty), so the
 * screens hide every QR code and link rather than print ones that point at a laptop.
 */
export function resolveStudentUrl(raw: string | undefined, dev: boolean): string {
  const url = (raw ?? '').trim().replace(/\/+$/, '');
  return url || (dev ? DEV_STUDENT_URL : '');
}
