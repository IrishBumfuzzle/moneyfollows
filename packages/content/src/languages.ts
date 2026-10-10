// Data-driven languages (CLAUDE.md 7.4): every i18n/<code>.json file is a language, and
// manifest.json only adds display details and the list of required languages. Pure functions:
// the caller passes the parsed files in.
import { I18nFileSchema } from '@paisa/shared';

export interface ContentManifest {
  version: string;
  /** Languages that must be complete (en and hi). */
  required: string[];
  /** Optional display details per language code. */
  languages: Record<string, { name?: string; dir?: string }>;
}

export interface LanguageInfo {
  code: string;
  name: string;
  dir: 'ltr' | 'rtl';
  /** "shipped" languages are shown to students; "machine_draft" ones only behind VITE_SHOW_DRAFT_LANGS. */
  status: 'shipped' | 'machine_draft';
  required: boolean;
}

export type I18nTables = Record<string, Record<string, string>> & {
  en: Record<string, string>;
  hi: Record<string, string>;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The "_meta.status" of a language file, if any. */
export function languageStatus(file: unknown): string | undefined {
  const meta = isRecord(file) ? file._meta : undefined;
  return isRecord(meta) && typeof meta.status === 'string' ? meta.status : undefined;
}

/** Flat key-to-text table of one file, without "_meta". Throws on a malformed file. */
export function toStrings(file: unknown): Record<string, string> {
  const parsed = I18nFileSchema.parse(file);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) if (typeof value === 'string') out[key] = value;
  return out;
}

/** Text tables for every language file. Throws if a required language has no file. */
export function buildI18n(files: Record<string, unknown>, manifest: ContentManifest): I18nTables {
  const out: Record<string, Record<string, string>> = {};
  for (const [code, file] of Object.entries(files)) out[code] = toStrings(file);
  for (const code of new Set([...manifest.required, 'en', 'hi'])) {
    if (!out[code]) throw new Error(`@paisa/content: required language file i18n/${code}.json is missing`);
  }
  return out as I18nTables;
}

/** Language list for a language picker, required languages first. */
export function buildLanguages(files: Record<string, unknown>, manifest: ContentManifest): LanguageInfo[] {
  const required = new Set(manifest.required);
  return Object.keys(files)
    .map((code): LanguageInfo => {
      const info = manifest.languages[code] ?? {};
      return {
        code,
        name: info.name ?? code,
        dir: info.dir === 'rtl' ? 'rtl' : 'ltr',
        status: !required.has(code) && languageStatus(files[code]) === 'machine_draft' ? 'machine_draft' : 'shipped',
        required: required.has(code),
      };
    })
    .sort((a, b) => Number(b.required) - Number(a.required) || a.code.localeCompare(b.code));
}
