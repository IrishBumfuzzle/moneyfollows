// Changing the language from inside the game (settings sheet, demo panel): saves it on the
// profile and sends language_changed. A ?lang= in the address overrides the profile (App.tsx),
// so then the address is rewritten and the page reloads in the new language.
import type { Lang } from '@paisa/shared';
import { track } from '../../api/track';
import type { Profile } from '../onboarding';
import { saveProfile } from '../onboarding/profile';

/** The languages the picker offers: Telugu only in builds with VITE_SHOW_DRAFT_LANGS=true. */
export function languageChoices(showDraft: boolean): Lang[] {
  return showDraft ? ['en', 'hi', 'te'] : ['en', 'hi'];
}

/** True for languages still waiting for a native speaker's review (CLAUDE.md 7.4). */
export const isDraftLang = (lang: Lang) => lang === 'te';

/** The address with ?lang= set to `lang`, or null when there is no ?lang= to override the profile. */
export function urlForLang(href: string, lang: Lang): string | null {
  const u = new URL(href);
  if (!u.searchParams.has('lang')) return null;
  u.searchParams.set('lang', lang);
  return u.pathname + u.search + u.hash;
}

export async function changeLang(profile: Profile, lang: Lang, setProfile: (p: Profile) => void): Promise<void> {
  if (profile.lang === lang && !new URL(window.location.href).searchParams.has('lang')) return;
  const p = { ...profile, lang };
  await saveProfile(p).catch(() => {});
  track('language_changed', { lang });
  const url = urlForLang(window.location.href, lang);
  if (url) {
    window.history.replaceState(window.history.state, '', url);
    window.location.reload();
    return;
  }
  setProfile(p);
}
