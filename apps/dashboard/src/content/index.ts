// Shell, sign-in and class screens share one dictionary; Progress and Gains keep their own.
import { makeT, type Dict, type Lang } from '../i18n';
import en from './en.json';
import hi from './hi.json';

export const STRINGS: Record<Lang, Dict> = { en, hi };
export const t = makeT(STRINGS);
