// The one api-client instance (CLAUDE.md 6: the UI talks to the backend only through it).
// Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (a fresh clone, the offline demo build)
// there is no backend: joinClass falls back to its stand-in and events stay queued on the phone.
import { createApiClient } from '@paisa/api-client';
import type { ApiClient } from '@paisa/api-client';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const api: ApiClient | null = url && anonKey ? createApiClient({ url, anonKey }) : null;
