// The content bundle: static JSON imported and parsed with the shared zod schemas at module
// load, so a bad file fails loudly the moment anything imports this package.
import {
  EventCardSchema,
  PersonaSchema,
  QuizQuestionSchema,
  ScamMessageSchema,
  ScenarioSchema,
  type ContentBundle,
} from '@paisa/shared';
import events from '../events/events.json';
import personas from '../personas.json';
import scamMessages from '../minigames/scam-or-safe.json';
import planBudget from '../scenarios/plan_budget.json';
import saveManage from '../scenarios/save_manage.json';
import understandInvesting from '../scenarios/understand_investing.json';
import staySafe from '../scenarios/stay_safe.json';
import baseline from '../quizzes/baseline.json';
import endline from '../quizzes/endline.json';
import manifest from '../manifest.json';
import badgeDefs from '../rewards/badges.json';
import { BadgeSchema, type Badge } from './badges';
import jarRounds from '../minigames/jar-splitter.json';
import { JarSplitRoundSchema, type JarSplitRound } from './jar-splitter';
import { buildI18n, buildLanguages, type ContentManifest, type LanguageInfo } from './languages';

const contentManifest: ContentManifest = manifest;

/** Bump in manifest.json when any content file changes. Sent with every synced event. */
export const CONTENT_VERSION: string = contentManifest.version;

export const content: ContentBundle = {
  version: CONTENT_VERSION,
  personas: PersonaSchema.array().parse(personas),
  scenarios: ScenarioSchema.array().parse([...planBudget, ...saveManage, ...understandInvesting, ...staySafe]),
  events: EventCardSchema.array().parse(events),
  quizzes: QuizQuestionSchema.array().parse([...baseline, ...endline]),
  scamMessages: ScamMessageSchema.array().parse(scamMessages),
};

/** Badges the engine's rewards module can award (rewards/badges.json). Kept outside ContentBundle so the frozen contract is unchanged. */
export const badges: Badge[] = BadgeSchema.array().parse(badgeDefs);

/** Jar Splitter practice rounds (minigames/jar-splitter.json). Also kept outside ContentBundle. */
export const jarSplitRounds: JarSplitRound[] = JarSplitRoundSchema.array().parse(jarRounds);

/**
 * Every i18n/<code>.json file, found at build time. Vite and Vitest turn the import.meta.glob
 * call into static imports; plain Node (tsx scripts) has no glob, so it reads the folder instead.
 * Either way, adding a language is a new file, not a code change (CLAUDE.md 7.4).
 */
function i18nFiles(): Record<string, unknown> {
  let globbed: Record<string, unknown> | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- import.meta.glob exists only under Vite; this package has no Vite types.
    globbed = import.meta.glob('../i18n/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
  } catch {
    globbed = undefined;
  }
  if (globbed) {
    const out: Record<string, unknown> = {};
    for (const [path, data] of Object.entries(globbed)) out[path.replace(/^.*\/|\.json$/g, '')] = data;
    return out;
  }
  return readI18nWithNode();
}

interface NodeFs {
  readdirSync(path: URL): string[];
  readFileSync(path: URL, encoding: 'utf8'): string;
}

function readI18nWithNode(): Record<string, unknown> {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const fs = proc?.getBuiltinModule?.('node:fs') as NodeFs | undefined;
  if (!fs) throw new Error('@paisa/content: cannot load i18n files (needs Vite import.meta.glob or Node 20.16+)');
  const dir = new URL('../i18n/', import.meta.url);
  const out: Record<string, unknown> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    out[file.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
  }
  return out;
}

const rawI18n = i18nFiles();

/**
 * Raw flat maps per language: key (without "t:") to text. Use react-i18next with
 * `keySeparator: false`; placeholders use its default `{{name}}` syntax.
 */
export const i18n = buildI18n(rawI18n, contentManifest);

/** Every language with a file: code, display name, text direction, and whether it ships or is a machine draft. */
export const languages: LanguageInfo[] = buildLanguages(rawI18n, contentManifest);

export * from './badges';
export * from './jar-splitter';
export * from './languages';
export * from './validate';
