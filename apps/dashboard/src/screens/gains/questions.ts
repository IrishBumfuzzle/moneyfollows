// The classroom quiz text lives in the content pack (packages/content/i18n). The dashboard only
// needs it on this screen, so it loads on demand instead of joining the main bundle.
import type { Dict } from '../../i18n';
import type { PackDicts } from './gains';

let cached: Promise<PackDicts> | null = null;

/** Resolves with the pack's en and hi dictionaries; with none if the import fails (the screen then shows question ids). */
export function loadQuestionDicts(): Promise<PackDicts> {
  cached ??= Promise.all([import('@paisa/content/i18n/en.json'), import('@paisa/content/i18n/hi.json')])
    .then(([en, hi]): PackDicts => ({ en: en.default as Dict, hi: hi.default as Dict }))
    .catch((): PackDicts => {
      cached = null; // let the next visit try again
      return {};
    });
  return cached;
}
