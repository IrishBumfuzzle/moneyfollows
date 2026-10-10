import { makeT, type Dict, type Lang } from '../../../i18n';
import en from './en.json';
import hi from './hi.json';

export const STRINGS: Record<Lang, Dict> = { en, hi };

/** The Progress screen's strings (falls back to English, then the key). */
export const t = makeT(STRINGS);
