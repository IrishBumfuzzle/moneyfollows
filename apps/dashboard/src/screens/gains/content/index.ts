// Learning-gains strings. Same per-feature pattern as the student app (CLAUDE.md 12): en + hi
// with identical keys, resolved by the dashboard's makeT (falls back to English, then the key).
import { makeT } from '../../../i18n';
import en from './en.json';
import hi from './hi.json';

export const STRINGS = { en, hi };
export const t = makeT(STRINGS);
