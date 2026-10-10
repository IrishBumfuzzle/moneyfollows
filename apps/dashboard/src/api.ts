// The dashboard's one door to the backend (CLAUDE.md 6). Staff sign in with an email code;
// RLS shows each facilitator only their own classes.
import { createApiClient, type ApiClient } from '@paisa/api-client';
import { resolveStudentUrl } from './studentUrl';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Null when the build has no Supabase URL or anon key; the app then shows a setup message. */
export const api: ApiClient | null = url && anonKey ? createApiClient({ url, anonKey }) : null;

/** Where the join QR code points. Empty in a production build without VITE_STUDENT_URL. */
export const STUDENT_URL = resolveStudentUrl(import.meta.env.VITE_STUDENT_URL, import.meta.env.DEV);

/** False when join links have nowhere to point: the screens then hide the QR, link and printed sheet. */
export const studentUrlConfigured = STUDENT_URL !== '';

/** The link a student opens to join: onboarding pre-fills the class code from ?code=. */
export const joinUrl = (classCode: string) => `${STUDENT_URL}/?code=${encodeURIComponent(classCode)}`;
