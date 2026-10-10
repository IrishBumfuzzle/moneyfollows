// Human review sheet for draft content (CLAUDE.md 7.1): npx tsx scripts/gen-review-sheet.ts [--out <file>]
// Lists every item still marked "draft" with its facts (effects, answers, verdicts, rules) and
// every string in en and hi side by side, so a reviewer can check it and flip meta.status to
// "reviewed" in the JSON file. Writes docs/review/content-review.md by default.
// The output has no timestamp: regenerating it changes the file only when content changed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectKeys, type ContentFile } from '../packages/content/src/validate';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

export interface ReviewInput {
  files: ContentFile[];
  /** Language code to its flat key map (keys without "t:"). Reads en and hi; others are ignored. */
  i18n: Record<string, Record<string, unknown>>;
  contentVersion: string;
}

/** Markdown table cell: pipes escaped, line breaks kept visible. */
function cell(text: string | undefined): string {
  if (text === undefined || text === '') return '**MISSING**';
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

const inr = new Intl.NumberFormat('en-IN');
/** Signed rupees with Indian grouping: +₹1,00,000, -₹50. */
const money = (v: unknown): string => (typeof v === 'number' ? `₹${inr.format(v)}` : str(v));
const rupees = (n: number): string => `${n < 0 ? '-' : '+'}₹${inr.format(Math.abs(n))}`;

function effectsText(effects: unknown): string {
  if (!isObj(effects)) return 'no change';
  const parts: string[] = [];
  if (isObj(effects.jars))
    for (const [jar, amount] of Object.entries(effects.jars))
      if (typeof amount === 'number') parts.push(`${jar} ${rupees(amount)}`);
  if (typeof effects.debt === 'number' && effects.debt !== 0) parts.push(`debt ${rupees(effects.debt)}`);
  if (Array.isArray(effects.flags) && effects.flags.length > 0) parts.push(`sets flag ${effects.flags.join(', ')}`);
  return parts.length > 0 ? parts.join(', ') : 'no change';
}

function choiceFacts(item: Obj): string[] {
  if (!Array.isArray(item.choices)) return [];
  return item.choices.filter(isObj).map((c) => {
    const delayed = Array.isArray(c.delayed)
      ? c.delayed.filter(isObj).map((d) => `; after ${str(d.afterWeeks)} wk: ${effectsText(d.effects)}`)
      : [];
    const rating = typeof c.rating === 'string' ? ` _(rated ${c.rating})_` : '';
    return `- Choice \`${str(c.id)}\`${rating}: ${effectsText(c.effects)}${delayed.join('')}`;
  });
}

function kindOf(path: string): string {
  if (path === 'personas.json') return 'persona';
  if (path === 'glossary.json') return 'glossary';
  if (path === 'places.json') return 'place';
  if (path.startsWith('news/')) return 'article';
  if (path.startsWith('rewards/')) return 'badge';
  if (path.endsWith('jar-splitter.json')) return 'jar';
  if (path.startsWith('minigames/')) return 'scam';
  if (path.startsWith('quizzes/')) return 'quiz';
  if (path.startsWith('events/')) return 'event';
  return 'scenario';
}

/** The non-text facts a reviewer needs to judge the strings. */
function factsOf(kind: string, item: Obj): string[] {
  const out: string[] = [];
  const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : str(v));
  switch (kind) {
    case 'scenario':
    case 'event':
      out.push(
        `- Pillar: ${str(item.pillar)} · concept: ${str(item.concept)} · personas: ${list(item.personas)}` +
          (kind === 'scenario' ? ` · difficulty ${str(item.difficulty)}` : ` · levels: ${list(item.levels)}`),
      );
      out.push(
        `- Place: ${str(item.location)}${typeof item.sublocation === 'string' ? ` › ${item.sublocation}` : ''} · ` +
          `${item.channel === 'phone' ? 'phone chat' : 'in person'} · speaker \`${str(item.speaker)}\``,
      );
      if (typeof item.requiresFlag === 'string') out.push(`- Shows only after flag \`${item.requiresFlag}\``);
      if (item.assumption === true) out.push('- Shows the AssumptionBanner');
      out.push(...choiceFacts(item));
      break;
    case 'quiz': {
      const options = Array.isArray(item.options) ? item.options : [];
      const answer = typeof item.answer === 'number' ? options[item.answer] : undefined;
      out.push(`- ${str(item.quiz)} quiz · pillar: ${str(item.pillar)} · concept: ${str(item.concept)}`);
      out.push(`- Correct answer: option ${Number(item.answer) + 1} (\`${str(answer)}\`)`);
      break;
    }
    case 'scam':
      out.push(
        `- Verdict: **${str(item.verdict).toUpperCase()}** · channel: ${str(item.channel)} · levels: ${list(item.levels)}`,
      );
      break;
    case 'persona': {
      const goal = isObj(item.goal) ? item.goal.amount : undefined;
      out.push(
        `- Income: ${JSON.stringify(item.income)} · fixed costs ${money(item.fixedCosts)} · goal ${money(goal)}`,
      );
      out.push(
        `- Payday split (%): ${JSON.stringify(item.split)} · starting jars: ${JSON.stringify(item.startingJars)}`,
      );
      break;
    }
    case 'article': {
      const q = isObj(item.question) ? item.question : {};
      const options = Array.isArray(q.options) ? q.options : [];
      const reward = isObj(item.reward) ? item.reward : {};
      const checked =
        isObj(item.meta) && typeof item.meta.factsCheckedBy === 'string' ? item.meta.factsCheckedBy : null;
      out.push(
        `- Edition ${str(item.edition)} · glossary words: ${list(item.terms)} · pays ${money(reward.wage)} and ${str(reward.xp)} XP`,
      );
      out.push(`- Correct answer: option ${Number(q.correct) + 1} (\`${str(options[Number(q.correct)])}\`)`);
      out.push(
        checked
          ? `- Facts checked by: ${checked}`
          : '- [ ] Facts checked by: ________ (needed before release: check every real rule, rate, price or date, then set `meta.factsCheckedBy`)',
      );
      break;
    }
    case 'glossary':
      break;
    case 'place': {
      const pos = isObj(item.position) ? `${str(item.position.x)}%, ${str(item.position.y)}%` : '?';
      const parent = typeof item.parent === 'string' ? ` · inside ${item.parent}` : '';
      const children = Array.isArray(item.children) ? ` · opens ${list(item.children)}` : '';
      out.push(`- Map position ${pos}${parent}${children}`);
      break;
    }
    case 'badge':
      out.push(`- Earned when: ${JSON.stringify(item.rule)} · pays ${str(item.xp)} XP · icon: ${str(item.icon)}`);
      break;
    case 'jar':
      out.push(
        `- Personas: ${list(item.personas)} · levels: ${list(item.levels)} · income ${money(item.income)} · slider step ${money(item.step)}`,
      );
      if (Array.isArray(item.checks))
        for (const c of item.checks.filter(isObj)) {
          const target =
            c.kind === 'min_jar'
              ? `${str(c.jar)} ≥ ${money(c.amount)}`
              : `${list(c.jars)} ${c.kind === 'min_share' ? '≥' : '≤'} ${str(c.percent)}%`;
          out.push(`- Check \`${str(c.id)}\`: ${target}`);
        }
      break;
  }
  return out;
}

/** A reference section: items without a review status (glossary terms, map places), shown for checking. */
function referenceSection(path: string, kind: string, items: Obj[], input: ReviewInput): string {
  const body: string[] = [`## \`${path}\` (reference: ${items.length}, no status to flip)`, ''];
  for (const item of items) {
    body.push(`### ${str(item.id)}`, '', ...factsOf(kind, item));
    body.push('', '| Key | English | हिन्दी |', '| --- | --- | --- |');
    for (const key of collectKeys(item)) {
      body.push(`| \`${key}\` | ${cell(textOf(input.i18n, 'en', key))} | ${cell(textOf(input.i18n, 'hi', key))} |`);
    }
    body.push('');
  }
  return body.join('\n');
}

const textOf = (i18n: ReviewInput['i18n'], lang: string, key: string): string | undefined => {
  const v = i18n[lang]?.[key];
  return typeof v === 'string' ? v : undefined;
};

/** Builds the Markdown review sheet. Pure: the same files always give the same text. */
export function buildReviewSheet(input: ReviewInput): string {
  const sections: string[] = [];
  const references: string[] = [];
  let total = 0;
  let reviewed = 0;
  for (const file of [...input.files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!Array.isArray(file.data)) continue;
    const kind = kindOf(file.path);
    const items = file.data.filter(isObj);
    if (kind === 'glossary' || kind === 'place') {
      references.push(referenceSection(file.path, kind, items, input));
      continue;
    }
    total += items.length;
    const drafts = items.filter((i) => isObj(i.meta) && i.meta.status === 'draft');
    reviewed += items.length - drafts.length;
    if (drafts.length === 0) continue;
    const body: string[] = [`## \`${file.path}\` (${drafts.length} draft)`, ''];
    for (const item of drafts) {
      const id = str(item.id);
      const author = isObj(item.meta) ? str(item.meta.author) : '?';
      body.push(`### ${id}`, '', `- [ ] Reviewed by: ________ (author: ${author})`, ...factsOf(kind, item), '');
      body.push('| Key | English | हिन्दी |', '| --- | --- | --- |');
      for (const key of collectKeys(item)) {
        body.push(`| \`${key}\` | ${cell(textOf(input.i18n, 'en', key))} | ${cell(textOf(input.i18n, 'hi', key))} |`);
      }
      body.push('');
    }
    sections.push(body.join('\n'));
  }
  const drafts = total - reviewed;
  const header = [
    '# Content review sheet',
    '',
    `Content version \`${input.contentVersion}\`: **${drafts} draft** and ${reviewed} reviewed out of ${total} items.`,
    '',
    'Generated by `npx tsx scripts/gen-review-sheet.ts`. Do not edit this file by hand; regenerate it after content changes.',
    '',
    '## How to review',
    '',
    '1. Read each item below. Check that the English and Hindi say the same thing and that the Hindi is conversational and follows `packages/content/glossary.hi.json`.',
    '2. Check the facts: the effects add up and match the story, the "best"-rated choice really is the better habit, quiz answers are right, and scam verdicts are right.',
    '3. Check the guardrails (CLAUDE.md 7.2): no real brands, no promises or advice to invest, fictional assets only, no shaming, about Class 8 reading level.',
    '4. If it is good, open the JSON file named in the section heading, find the item by its id, and change `"status": "draft"` to `"status": "reviewed"` in its `meta`. Fix or flag anything that is wrong instead.',
    '5. Paisa Times articles also need a fact check: confirm every real rule, rate, price or date, then add `"factsCheckedBy": "<name>"` to the article\'s `meta`. `--strict` fails without it.',
    '6. Glossary terms and map places have no status of their own. Check them with the articles that use them (sections at the end).',
    '7. Run `pnpm lint:content` (and `pnpm lint:content --strict` once everything is reviewed).',
    '',
  ].join('\n');
  const done = drafts === 0 ? '\nEvery item is reviewed. `pnpm lint:content --strict` should pass.\n' : '';
  const refs = references.length > 0 ? `\n${references.join('\n')}` : '';
  return `${header}${done}\n${sections.join('\n')}${refs}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---- CLI ----------------------------------------------------------------------------------

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'packages', 'content');
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const jsonIn = (dir: string): string[] => {
  try {
    return readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => `${dir}/${f}`);
  } catch {
    return [];
  }
};

/** Reads packages/content from disk, the same files lint:content checks. */
export function readContent(): ReviewInput {
  const files: ContentFile[] = [
    ...['scenarios', 'events', 'quizzes', 'minigames', 'rewards', 'news'].flatMap(jsonIn),
    'personas.json',
    'glossary.json',
    'places.json',
  ].map((path) => ({ path, data: readJson(path) }));
  const i18n: ReviewInput['i18n'] = {};
  for (const path of jsonIn('i18n')) i18n[basename(path, '.json')] = readJson(path) as Record<string, unknown>;
  const manifest = readJson('manifest.json') as { version?: unknown };
  return { files, i18n, contentVersion: String(manifest.version) };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const at = process.argv.indexOf('--out');
  const out =
    at > 0 && process.argv[at + 1]
      ? resolve(process.argv[at + 1]!)
      : fileURLToPath(new URL('../docs/review/content-review.md', import.meta.url));
  const sheet = buildReviewSheet(readContent());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sheet, 'utf8');
  const drafts = /\*\*(\d+) draft\*\*/.exec(sheet)?.[1] ?? '0';
  console.log(`Wrote ${out}: ${drafts} draft item(s) to review.`);
}
