// npm run lint:content [-- --strict] [dir...]
// Loads each content folder, validates it and prints every issue. Exits 1 on any
// error (or any warning with --strict).
import { resolve } from 'node:path';
import { loadContentDir, validateSource } from '../src';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const dirs = args.filter((a) => !a.startsWith('--'));
if (dirs.length === 0) dirs.push('content/fixtures');

let failed = false;
for (const dir of dirs) {
  const { source, issues: loadIssues } = loadContentDir(resolve(dir));
  const { issues } = validateSource(source);
  const all = [...loadIssues, ...issues];
  const errors = all.filter((i) => i.severity === 'error');
  const warnings = all.filter((i) => i.severity === 'warning');
  for (const i of all) console.log(`${i.severity === 'error' ? 'ERROR' : 'warn '} ${dir} ${i.itemId} [${i.rule}] ${i.message}`);
  console.log(
    `${dir}: ${source.scenarios.length} scenarios, ${source.events.length} events, ${source.quizQuestions.length} quiz questions, ` +
      `${source.scamMessages.length} scam messages; ${errors.length} errors, ${warnings.length} warnings`,
  );
  if (errors.length > 0 || (strict && warnings.length > 0)) failed = true;
}
process.exit(failed ? 1 : 0);
