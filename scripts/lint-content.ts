// Guardrail linter CLI (CLAUDE.md 7.2): pnpm lint:content [--strict]
// Reads packages/content/** from disk, runs validateContent, prints issues. Exits 1 on any error.
// Warnings never fail the run. --strict also turns "status: draft", and articles without
// meta.factsCheckedBy, into errors (release builds).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, type ContentFile, type Guardrails, type Issue } from '../packages/content/src/validate';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'packages', 'content');

function readJson(rel: string): unknown {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (err) {
    console.error(`Cannot read ${rel}: ${(err as Error).message}`);
    process.exit(1);
  }
}

function jsonIn(dir: string): string[] {
  try {
    return readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => `${dir}/${f}`);
  } catch {
    return [];
  }
}

const strict = process.argv.includes('--strict');

const files: ContentFile[] = [
  ...['scenarios', 'events', 'quizzes', 'minigames', 'rewards', 'news'].flatMap(jsonIn),
  'personas.json',
  'places.json',
  'glossary.json',
].map((path) => ({ path, data: readJson(path) }));

const i18n: Record<string, Record<string, unknown>> = {};
for (const path of jsonIn('i18n')) i18n[basename(path, '.json')] = readJson(path) as Record<string, unknown>;

const guardrails = readJson('guardrails.json') as Guardrails;
// manifest.json holds CONTENT_VERSION and the required languages; any i18n/<code>.json is a language.
const manifest = readJson('manifest.json') as { version?: unknown; required?: unknown };
const requiredLanguages = Array.isArray(manifest.required)
  ? manifest.required.filter((l): l is string => typeof l === 'string')
  : undefined;
const contentVersion = typeof manifest.version === 'string' ? manifest.version : String(manifest.version);
const issues: Issue[] = validateContent({ files, i18n, guardrails, requiredLanguages, contentVersion }, { strict });

const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');
for (const i of issues)
  console.log(`${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.file} ${i.id} [${i.rule}] ${i.message}`);
console.log(
  `\n${files.length} content files, ${Object.keys(i18n).length} languages (${Object.keys(i18n).join(', ')}): ` +
    `${errors.length} error(s), ${warnings.length} warning(s)${strict ? ' (strict)' : ''}`,
);
process.exit(errors.length > 0 ? 1 : 0);
