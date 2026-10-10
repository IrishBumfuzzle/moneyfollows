// The dashboard's one door to the backend (CLAUDE.md 6). Staff sign in with an email code;
// RLS shows each facilitator only their own classes. In sample mode (?demo=1, src/mode.ts) the
// same API runs on made-up data in the browser instead.
import { createApiClient } from '@paisa/api-client';
import { SAMPLE_MODE } from './mode';
import { createSampleApi } from './sample/sampleApi';
import { resolveStudentUrl } from './studentUrl';
import type { DashboardApi } from './types';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Null when the build has no Supabase URL or anon key and sample mode is off; the app then shows a setup message. */
export const api: DashboardApi | null = SAMPLE_MODE
  ? createSampleApi({ storage: sessionStore() })
  : url && anonKey
    ? createApiClient({ url, anonKey })
    : null;

/** Where the join QR code points. Empty in a production build without VITE_STUDENT_URL. */
export const STUDENT_URL = resolveStudentUrl(import.meta.env.VITE_STUDENT_URL, import.meta.env.DEV);

/** False when join links have nowhere to point: the screens then hide the QR, link and printed sheet. */
export const studentUrlConfigured = STUDENT_URL !== '';

/** The link a student opens to join: onboarding pre-fills the class code from ?code=. */
export const joinUrl = (classCode: string) => `${STUDENT_URL}/?code=${encodeURIComponent(classCode)}`;
