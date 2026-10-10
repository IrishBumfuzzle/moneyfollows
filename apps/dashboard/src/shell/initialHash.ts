// supabase-js reads (and clears) the auth tokens or errors in the URL hash when the client is
// created in api.ts. App.tsx imports this file first so the hash is captured before that happens.
import { hasAuthLinkError } from './route';

export const AUTH_LINK_ERROR = typeof window !== 'undefined' && hasAuthLinkError(window.location.hash);
