import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameContent, type StringTable } from '@paisa/contracts';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every .json in a folder; a file holding an array contributes each item. */
function readFolder(dir: string): unknown[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      const v = readJson(join(dir, f));
      return Array.isArray(v) ? v : [v];
    });
}

/** Loads a fixture-shaped content folder (tuning.json plus scenarios/, events/, personas/, ...). */
export function loadContentDir(dir: string): { content: GameContent; strings: StringTable } {
  const content = GameContent.parse({
    scenarios: readFolder(join(dir, 'scenarios')),
    events: readFolder(join(dir, 'events')),
    personas: readFolder(join(dir, 'personas')),
    reflections: readFolder(join(dir, 'reflections')),
    quizQuestions: readFolder(join(dir, 'quiz')),
    tuning: readJson(join(dir, 'tuning.json')),
  });
  const stringsPath = join(dir, 'strings', 'en.json');
  const strings = existsSync(stringsPath) ? (readJson(stringsPath) as StringTable) : {};
  return { content, strings };
}
