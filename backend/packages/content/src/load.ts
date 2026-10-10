import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { ZodType } from 'zod';
import {
  ContentSource,
  EventCard,
  LANGUAGES,
  Persona,
  QuizQuestion,
  Reflection,
  Scenario,
  ScamMessage,
  StringTable,
  Tuning,
  type Language,
} from '@paisa/contracts';
import type { ContentIssue } from './issues';

export interface LoadResult {
  source: ContentSource;
  /** Files that failed to parse. Their items are left out of `source`. */
  issues: ContentIssue[];
}

// Folder name -> schema. Each JSON file holds one item or an array of items.
const FOLDERS = {
  scenarios: Scenario,
  events: EventCard,
  personas: Persona,
  reflections: Reflection,
  quiz: QuizQuestion,
  scams: ScamMessage,
} as const;

/**
 * Loads a content folder laid out like `backend/content/fixtures`:
 * tuning.json, strings/<lang>.json and one folder per item kind.
 */
export function loadContentDir(dir: string): LoadResult {
  const issues: ContentIssue[] = [];
  const at = (file: string) => relative(dir, file) || basename(file);

  function readJson(file: string): unknown {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      issues.push({ itemId: at(file), rule: 'json', message: (err as Error).message, severity: 'error' });
      return undefined;
    }
  }

  function parseAll<T>(folder: string, schema: ZodType<T>): T[] {
    const path = join(dir, folder);
    if (!existsSync(path)) return [];
    const items: T[] = [];
    for (const name of readdirSync(path).filter((n) => n.endsWith('.json')).sort()) {
      const file = join(path, name);
      const raw = readJson(file);
      if (raw === undefined) continue;
      const list = Array.isArray(raw) ? raw : [raw];
      list.forEach((entry, i) => {
        const parsed = schema.safeParse(entry);
        if (parsed.success) {
          items.push(parsed.data);
        } else {
          const id = (entry as { id?: unknown })?.id;
          for (const issue of parsed.error.issues) {
            issues.push({
              itemId: typeof id === 'string' ? id : `${at(file)}[${i}]`,
              rule: 'schema',
              message: `${at(file)}: ${issue.path.join('.') || '(root)'}: ${issue.message}`,
              severity: 'error',
            });
          }
        }
      });
    }
    return items;
  }

  let tuning: Tuning | undefined;
  const tuningFile = join(dir, 'tuning.json');
  if (existsSync(tuningFile)) {
    const parsed = Tuning.safeParse(readJson(tuningFile));
    if (parsed.success) tuning = parsed.data;
    else issues.push({ itemId: 'tuning', rule: 'schema', message: parsed.error.message, severity: 'error' });
  }

  const strings: Partial<Record<Language, StringTable>> = {};
  for (const lang of LANGUAGES) {
    const file = join(dir, 'strings', `${lang}.json`);
    if (!existsSync(file)) continue;
    const parsed = StringTable.safeParse(readJson(file));
    if (parsed.success) strings[lang] = parsed.data;
    else issues.push({ itemId: `strings.${lang}`, rule: 'schema', message: parsed.error.message, severity: 'error' });
  }

  const source = ContentSource.parse({
    scenarios: parseAll('scenarios', FOLDERS.scenarios),
    events: parseAll('events', FOLDERS.events),
    personas: parseAll('personas', FOLDERS.personas),
    reflections: parseAll('reflections', FOLDERS.reflections),
    quizQuestions: parseAll('quiz', FOLDERS.quiz),
    scamMessages: parseAll('scams', FOLDERS.scams),
    tuning,
    strings,
  });
  return { source, issues };
}
