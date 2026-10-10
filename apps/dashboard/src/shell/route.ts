// Hash routes, so the app needs no server rewrites and the browser's back button just works:
//   #/                       the class list
//   #/class/<id>/progress    (also /gains and /settings)
export type ClassTab = 'progress' | 'gains' | 'settings';
export const CLASS_TABS: readonly ClassTab[] = ['progress', 'gains', 'settings'];

export type Route = { name: 'classes' } | { name: 'class'; id: string; tab: ClassTab };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Anything unrecognised is the class list; a class id with a bad tab opens its Progress. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split(/[?#]/)[0] ?? '';
  const parts = path.split('/');
  if (parts[parts.length - 1] === '') parts.pop(); // a trailing slash is fine; an empty middle part is not
  if (parts[0] !== 'class' || parts.length > 3) return { name: 'classes' };
  let id: string;
  try {
    id = decodeURIComponent(parts[1] ?? '');
  } catch {
    return { name: 'classes' };
  }
  if (!ID.test(id)) return { name: 'classes' };
  const tab = CLASS_TABS.find((x) => x === parts[2]) ?? 'progress';
  return { name: 'class', id, tab };
}

export function hashFor(route: Route): string {
  return route.name === 'classes' ? '#/' : `#/class/${encodeURIComponent(route.id)}/${route.tab}`;
}

/** A stable key for "which page is this", used to move focus when the page changes. */
export const routeKey = (route: Route) => (route.name === 'classes' ? 'classes' : `class:${route.id}:${route.tab}`);

/**
 * Supabase puts a failed invite or magic link in the hash (#error=access_denied&error_code=otp_expired…).
 * Staff then see why, instead of a sign-in form with no explanation.
 */
export function hasAuthLinkError(hash: string): boolean {
  const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
  return params.has('error') || params.has('error_code') || params.has('error_description');
}
