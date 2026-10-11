// The "Forgot password?" email links to the dashboard with ?reset=<token hash>
// (supabase/templates/recovery.html). Read it once on load and take it out of the address bar, so a
// reload, a bookmark or a shared screenshot never carries a used link.
const PARAM = 'reset';

/** The token hash in a query string, or null. */
export function readResetToken(search: string): string | null {
  const token = new URLSearchParams(search).get(PARAM)?.trim();
  return token ? token : null;
}

/** The same address without the reset token (the hash route and other parameters stay). */
export function withoutResetToken(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

function takeResetToken(): string | null {
  const token = readResetToken(window.location.search);
  if (token) window.history.replaceState(window.history.state, '', withoutResetToken(window.location.href));
  return token;
}

export const RESET_TOKEN = typeof window !== 'undefined' ? takeResetToken() : null;
