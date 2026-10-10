// Paisa Times glossary builder. Authoring time only, on a laptop; never part of the app (CLAUDE.md 7.1).
//   pnpm glossary [--edition 2026-W41] [--article upi_fraud] [--write]
// For each article an LLM picks up to 4 money words (EXTRACT). A word already in glossary.json is
// reused; a new word gets a simple meaning and an example in English and Hindi (DEFINE), checked by
// validateEntry. Each word is then marked as [[termId]] in both bodies, or in neither. Without --write
// nothing is saved. The rules live in src/features/news/glossary-build.ts and are unit-tested there.
// It reads BE-1's content pack (packages/content) and, with --write, changes it: agree that with BE-1.
// The OpenRouter key is read from the repo-root .env and only ever sent in the Authorization header.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  DefineResponse,
  ExtractResponse,
  MAX_WORDS,
  findPhrase,
  findTerm,
  formatJson,
  isTermId,
  markArticle,
  mergeGlossary,
  termWords,
  toTermId,
  validateEntry,
} from '../src/features/news/glossary-build';
import type { NewEntry, Strings, WordToMark } from '../src/features/news/glossary-build';
import type { Article, GlossaryTerm } from '../src/features/news/types';

const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 30_000;
const USAGE = 'Usage: pnpm glossary [--edition <id>] [--article <id>] [--write]';
const STYLE_EXAMPLES = ['upi', 'inflation', 'emi'];

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENV_FILE = `${ROOT}.env`;
const CONTENT = `${ROOT}packages/content/`;          // BE-1's content pack (@paisa/content)

/** Stops the run before anything is written, because every later call would fail the same way. */
class Fatal extends Error {}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---- Flags, content and key -------------------------------------------------------------------

let flags: { edition?: string; article?: string; write?: boolean } = {};
try {
  flags = parseArgs({
    options: { edition: { type: 'string' }, article: { type: 'string' }, write: { type: 'boolean' } },
  }).values;
} catch (e) {
  fail(`${(e as Error).message.split('. ')[0]}. ${USAGE}`);
}

interface JsonFile<T> {
  path: string;
  raw: string;                                       // '' when the file does not exist yet
  data: T;
}
function readJson<T>(path: string, fallback?: T): JsonFile<T> {
  if (fallback !== undefined && !existsSync(path)) return { path, raw: '', data: fallback };
  const raw = readFileSync(path, 'utf8');
  return { path, raw, data: JSON.parse(raw) as T };
}

const editions = readdirSync(`${CONTENT}news/`)
  .filter((f) => /^\d{4}-W\d{2}\.json$/.test(f))
  .map((f) => f.slice(0, -'.json'.length))
  .sort();
if (!editions.length) fail('No edition (YYYY-Www.json) in packages/content/news.');
const editionId = flags.edition ?? (editions.length === 1 ? editions[0] : fail(`Pick an edition with --edition: ${editions.join(', ')}`));
if (!editions.includes(editionId)) fail(`No edition "${editionId}" in packages/content/news. Editions: ${editions.join(', ')}`);

interface Review {
  status: 'draft';
  author: string;                                    // the model that wrote the entry
  source: string;                                    // "<edition>/<articleId>"
}

const editionFile = readJson<Article[]>(`${CONTENT}news/${editionId}.json`);
const glossaryFile = readJson<GlossaryTerm[]>(`${CONTENT}glossary.json`);
const enFile = readJson<Strings>(`${CONTENT}i18n/en.json`);
const hiFile = readJson<Strings>(`${CONTENT}i18n/hi.json`);
// GlossaryTerm is a frozen contract with no meta, so review status lives in this side file.
const reviewFile = readJson<Record<string, Review>>(`${CONTENT}glossary.review.json`, {});
const guardrails = readJson<{ brands: string[]; promises: string[] }>(`${CONTENT}guardrails.json`).data;
const hindiTerms = readJson<unknown>(`${CONTENT}glossary.hi.json`).data;
const forbidden = [...guardrails.brands, ...guardrails.promises];

const selected = flags.article ? editionFile.data.filter((a) => a.id === flags.article) : editionFile.data;
if (!selected.length)
  fail(`No article "${flags.article}" in ${editionId}. Articles: ${editionFile.data.map((a) => a.id).join(', ')}`);

if (typeof process.loadEnvFile !== 'function') fail('This needs Node 20.12 or newer (process.loadEnvFile).');
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // No .env: the key check below says what to do.
}
const KEY = process.env.OPENROUTER_API_KEY?.trim();
if (!KEY) fail('OPENROUTER_API_KEY is not set. Add it to the repo-root .env (see .env.example).');
const MODEL = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;

// ---- OpenRouter -------------------------------------------------------------------------------

interface Tally {
  calls: number;
  prompt: number;
  completion: number;
  cost: number;                                      // USD, when OpenRouter reports it
}
const newTally = (): Tally => ({ calls: 0, prompt: 0, completion: 0, cost: 0 });
const callCount = (n: number) => `${n} call${n === 1 ? '' : 's'}`;
const total = newTally();
const modelsUsed = new Set<string>();
const num = (x: number) => x.toLocaleString('en-IN');

interface Completion {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
}
type Message = { role: 'system' | 'user'; content: string };
type Posted = { status: number; json: Completion; retryAfter: number | null } | { error: string };

async function post(body: string): Promise<Posted> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Paisa Path glossary builder',
      },
      body,
      signal: ac.signal,
    });
    const text = await res.text();
    let json: Completion = {};
    try {
      json = JSON.parse(text) as Completion;
    } catch {
      // Not JSON (e.g. a gateway error page): the status says enough.
    }
    return { status: res.status, json, retryAfter: Number(res.headers.get('retry-after')) || null };
  } catch (e) {
    return { error: ac.signal.aborted ? `no reply within ${TIMEOUT_MS / 1000} s` : `network error: ${(e as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

/** One chat completion whose reply must follow `schema`. Prints the model and the tokens used. */
async function complete(
  label: string,
  name: string,
  schema: z.ZodType,
  messages: Message[],
  tally: Tally,
): Promise<{ content: string; model: string } | { error: string }> {
  const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete jsonSchema.$schema;
  const body = JSON.stringify({
    model: MODEL,
    messages,
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: jsonSchema } },
    provider: { require_parameters: true },
  });
  let reply = await post(body);
  if ('status' in reply && reply.status === 429) {
    const wait = Math.min(reply.retryAfter ?? 10, 60);
    console.log(`    ${label}: rate limited (429), trying once more in ${wait} s`);
    await new Promise((done) => setTimeout(done, wait * 1000));
    reply = await post(body);
  }
  if ('error' in reply) return { error: reply.error };
  const { status, json } = reply;
  const detail = String(json.error?.message ?? 'no details').slice(0, 200);
  if (status === 401) throw new Fatal('OpenRouter said 401: it did not accept the key. Check OPENROUTER_API_KEY in the repo-root .env.');
  if (status === 402) throw new Fatal('OpenRouter said 402: this key has no credits left. Add credits on openrouter.ai and run again.');
  if (status === 429) return { error: 'rate limited twice (429)' };
  if (status === 400 || status === 404)
    throw new Fatal(`OpenRouter said ${status}: ${detail} (model ${MODEL}; set another with OPENROUTER_MODEL).`);
  if (status !== 200) return { error: `OpenRouter said ${status}: ${detail}` };
  if (json.error) return { error: `OpenRouter: ${detail}` };

  const model = json.model ?? MODEL;
  const prompt = json.usage?.prompt_tokens ?? 0;
  const completion = json.usage?.completion_tokens ?? 0;
  for (const t of [tally, total]) {
    t.calls += 1;
    t.prompt += prompt;
    t.completion += completion;
    t.cost += json.usage?.cost ?? 0;
  }
  modelsUsed.add(model);
  console.log(`    ${label}: ${model} · ${num(prompt)} in / ${num(completion)} out tokens`);
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return { error: 'empty reply' };
  return { content, model };
}

/** JSON that matches `schema` and passes `check`. A failed reply is asked for once more, with the problems added. */
async function askJson<T>(
  label: string,
  name: string,
  schema: z.ZodType<T>,
  system: string,
  user: string,
  tally: Tally,
  check: (data: T) => string[] = () => [],
): Promise<{ data: T; model: string } | { error: string }> {
  let prompt = user;
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    const reply = await complete(attempt === 1 ? label : `${label} (retry)`, name, schema, messages, tally);
    if ('error' in reply) return reply;
    let parsed: ReturnType<typeof schema.safeParse> | undefined;
    try {
      parsed = schema.safeParse(JSON.parse(reply.content));
    } catch {
      problems = ['the reply was not valid JSON'];
    }
    if (parsed && !parsed.success) problems = [z.prettifyError(parsed.error)];
    if (parsed?.success) {
      problems = check(parsed.data);
      if (!problems.length) return { data: parsed.data, model: reply.model };
    }
    prompt = `${user}\n\nYour last reply was rejected:\n- ${problems.join('\n- ')}\nReply again with all of this fixed.`;
  }
  return { error: `rejected twice: ${problems.join('; ')}` };
}

// ---- Prompts ----------------------------------------------------------------------------------

const PAPER =
  'Paisa Times is a weekly money newspaper inside a learning game for students aged 16-18 in Hyderabad, India. ' +
  'The app highlights glossary words in each article; a student taps one to see a simple meaning.';

const EXTRACT_SYSTEM = `You help edit Paisa Times. ${PAPER} Reply only with JSON that matches the schema.`;

const DEFINE_SYSTEM = [
  `You write glossary entries for Paisa Times. ${PAPER}`,
  'An entry has the word, a simple meaning and an everyday example, in English and in Hindi.',
  'Rules:',
  '- Educate, never recommend: no advice such as "you should invest" or "you should buy".',
  '- No guarantees: never "guaranteed", "risk-free", "sure returns" or "double your money".',
  '- Never name a real bank, payment app, loan app, fund, company, product or government scheme.',
  '- No real figures: no real interest rates, prices or dates. Small made-up rupee amounts such as ₹500 are fine.',
  '- No shaming of poverty or of anyone’s family, and no preaching.',
  '- About Class 8 reading level: short, plain sentences.',
  'Reply only with JSON that matches the schema.',
].join('\n');

const quoted = (label: string, text: string) => [`${label}:`, '"""', text, '"""'].join('\n');

function extractPrompt(enBody: string, hiBody: string, glossary: GlossaryTerm[], en: Strings): string {
  const dictionary = glossary.map((g) => `${g.id} | ${en[g.word.slice(2)]} | ${en[g.simple.slice(2)]}`);
  return [
    `Pick at most ${MAX_WORDS} money words or short money phrases in this article that a student aged 16-18 may not know.`,
    'Skip names of people and places, everyday words (money, pay, shop, phone, family) and anything inside [[...]]: those are already highlighted.',
    '',
    'For each word give:',
    '- termId: the dictionary id if the word is in the dictionary below, otherwise a new snake_case id (a-z, 0-9 and _).',
    '- en_phrase: the exact text as it appears in the English article, with the same spelling and case.',
    '- hi_phrase: the exact text for the same word as it appears in the Hindi article, or null if the Hindi article has no exact match.',
    '- is_existing: true if the word is in the dictionary.',
    'Return {"terms": []} if nothing qualifies.',
    '',
    quoted('English article', enBody),
    '',
    quoted('Hindi article', hiBody),
    '',
    'Dictionary (id | word | meaning):',
    ...dictionary,
  ].join('\n');
}

function definePrompt(
  enPhrase: string,
  hiPhrase: string | null,
  enBody: string,
  hiBody: string,
  glossary: GlossaryTerm[],
  en: Strings,
  hi: Strings,
): string {
  // Three existing entries show the style: the preferred ones if present, else the first in the dictionary.
  const picks = [...new Set([...STYLE_EXAMPLES.flatMap((id) => glossary.filter((g) => g.id === id)), ...glossary])];
  const line = (label: string, s: Strings, g: GlossaryTerm) =>
    `${label}: ${[g.word, g.simple, g.example].map((k) => s[k.slice(2)]).join(' | ')}`;
  const examples = picks.slice(0, 3).map((g) => `${line('English', en, g)}\n${line('Hindi', hi, g)}`);
  const word = hiPhrase
    ? `- word: exactly "${enPhrase}" in English and exactly "${hiPhrase}" in Hindi. The app shows this word inside the article's sentence, so it must match the article.`
    : `- word: exactly "${enPhrase}" in English. In Hindi, the usual conversational word for it (the term list below has many).`;
  return [
    `New word: "${enPhrase}".`,
    hiPhrase ? `The Hindi article has it as "${hiPhrase}".` : 'The Hindi article has no exact match for it.',
    '',
    quoted('English article', enBody),
    '',
    quoted('Hindi article', hiBody),
    '',
    'Write the entry in English (en) and Hindi (hi):',
    word,
    '- simple: one sentence of at most 100 characters that says what it means.',
    '- example: one everyday line of at most 140 characters, set in Hyderabad, with Sana, Ravi, Ammi or Nani.',
    'Hindi must be conversational, the way people talk at home (polite आप), not formal or bookish. Keep UPI, OTP, EMI and KYC in English with a short Hindi explanation in brackets, as in the examples.',
    '',
    'Our Hindi term list (use these words):',
    JSON.stringify(hindiTerms),
    '',
    'Examples from our dictionary (word | simple | example):',
    examples.join('\n\n'),
  ].join('\n');
}

// ---- One article ------------------------------------------------------------------------------

let glossary = glossaryFile.data;
let en = enFile.data;
let hi = hiFile.data;
const review: Record<string, Review> = { ...reviewFile.data };
const articles = editionFile.data.map((a) => ({ ...a, terms: [...a.terms] }));

async function buildArticle(article: Article): Promise<void> {
  const tally = newTally();
  const bodyKey = article.body.slice(2);
  const enBody = en[bodyKey];
  const hiBody = hi[bodyKey];
  console.log(`\n${article.id} · ${en[article.headline.slice(2)] ?? article.headline}`);
  if (enBody === undefined || hiBody === undefined) {
    console.log(`  skipped: ${bodyKey} is missing from ${enBody === undefined ? 'en' : 'hi'}.json`);
    return;
  }

  const extracted = await askJson('extract', 'glossary_extract', ExtractResponse, EXTRACT_SYSTEM, extractPrompt(enBody, hiBody, glossary, en), tally);
  if ('error' in extracted) {
    console.log(`  skipped this article: ${extracted.error}`);
    return;
  }
  const found = extracted.data.terms.slice(0, MAX_WORDS);
  const report = { found: [] as string[], fresh: [] as string[], skipped: [] as string[] };
  if (extracted.data.terms.length > MAX_WORDS)
    report.found.push(`(the model gave ${extracted.data.terms.length} words; kept the first ${MAX_WORDS})`);

  const toMark: WordToMark[] = [];
  for (const f of found) {
    // The dictionary decides what is new, not the model.
    const known = findTerm(glossary, en, f.en_phrase) ?? findTerm(glossary, en, f.termId);
    if (known) {
      report.found.push(`"${f.en_phrase}" → ${known.id}, in the dictionary${f.is_existing ? '' : ' (the model said new)'}`);
      toMark.push({ termId: known.id, en_phrase: f.en_phrase, hi_phrase: f.hi_phrase });
      continue;
    }
    const id = isTermId(f.termId) ? f.termId : toTermId(f.en_phrase);
    report.found.push(`"${f.en_phrase}" → ${id || '(no id)'}, new${f.is_existing ? ' (the model said it was in the dictionary)' : ''}`);
    const enPhrase = findPhrase(enBody, f.en_phrase);
    if (!id || toMark.some((w) => w.termId === id) || enPhrase === null) {
      const why = !id ? 'no usable id' : enPhrase === null ? 'not found in the English text, outside [[...]]' : 'listed twice';
      report.skipped.push(`"${f.en_phrase}": ${why}; not defined`);
      continue;
    }
    const hiPhrase = f.hi_phrase === null ? null : findPhrase(hiBody, f.hi_phrase);
    const defined = await askJson(
      `define ${id}`,
      'glossary_define',
      DefineResponse,
      DEFINE_SYSTEM,
      definePrompt(enPhrase, hiPhrase, enBody, hiBody, glossary, en, hi),
      tally,
      (d) => validateEntry({ id, ...d }, forbidden, { en: enPhrase, hi: hiPhrase }),
    );
    if ('error' in defined) {
      report.skipped.push(`"${enPhrase}" (${id}): no definition, ${defined.error}`);
      continue;
    }
    const entry: NewEntry = { id, ...defined.data };
    const merged = mergeGlossary(glossary, en, hi, [entry]);
    if (!merged.added.length) {
      report.skipped.push(`"${enPhrase}" (${id}): glossary.${id}.* strings already exist in en/hi.json; left alone`);
      continue;
    }
    ({ glossary, en, hi } = merged);                 // later articles reuse it
    review[id] = { status: 'draft', author: defined.model, source: `${editionId}/${article.id}` };
    for (const lang of ['en', 'hi'] as const)
      report.fresh.push(`${lang === 'en' ? id.padEnd(16) : ''.padEnd(16)}${lang}  ${entry[lang].word} | ${entry[lang].simple} | ${entry[lang].example}`);
    toMark.push({ termId: id, en_phrase: enPhrase, hi_phrase: hiPhrase ?? f.hi_phrase });
  }

  const marked = markArticle({ en: en[bodyKey], hi: hi[bodyKey], terms: article.terms }, toMark, {
    en: termWords(glossary, en),
    hi: termWords(glossary, hi),
  });
  en = { ...en, [bodyKey]: marked.en };
  hi = { ...hi, [bodyKey]: marked.hi };
  article.terms = marked.terms;

  const hindi = marked.skipped.filter((s) => s.hindi);
  const skipped = [
    ...report.skipped,
    ...marked.skipped.filter((s) => !s.hindi).map((s) => `"${s.phrase}" (${s.termId}): ${s.reason}`),
  ];
  const section = (title: string, lines: string[]) => {
    if (!lines.length) return;
    console.log(`  ${title}`);
    for (const l of lines) console.log(`    ${l}`);
  };
  section('words found', report.found.length ? report.found : ['none']);
  section('new words (draft)', report.fresh);
  section('markers added', [marked.marked.length ? `${marked.marked.map((id) => `[[${id}]]`).join(', ')} in en and hi` : 'none']);
  section('skipped', skipped);
  section(
    'not marked because of the Hindi (a person can add [[id]] to both bodies)',
    hindi.map((s) => `"${s.phrase}" (${s.termId}): ${s.reason}`),
  );
  section('tokens', [`${num(tally.prompt)} in / ${num(tally.completion)} out, ${callCount(tally.calls)}`]);
}

// ---- Run --------------------------------------------------------------------------------------

console.log(`Paisa Times glossary builder · ${editionId} · ${MODEL} · ${flags.write ? 'writing' : 'dry run'}`);
try {
  for (const a of selected) await buildArticle(articles.find((x) => x.id === a.id)!);
} catch (e) {
  if (e instanceof Fatal) fail(`\n${e.message}\nStopped; nothing was written.`);
  throw e;
}

const cost = total.cost ? ` · $${total.cost.toFixed(4)}` : '';
console.log(
  `\nTotal: ${callCount(total.calls)} ·${num(total.prompt)} in / ${num(total.completion)} out tokens · ${[...modelsUsed].join(', ') || MODEL}${cost}`,
);

// Write only files whose content changed, laid out like before (same trailing newline), so diffs stay small.
const outputs: [JsonFile<unknown>, unknown][] = [
  [editionFile, articles],
  [glossaryFile, glossary],
  [enFile, en],
  [hiFile, hi],
];
if (Object.keys(review).length) outputs.push([reviewFile, review]);
const changes = outputs
  .map(([file, data]) => ({ file, text: formatJson(data) + (file.raw === '' || file.raw.endsWith('\n') ? '\n' : '') }))
  .filter(({ file, text }) => text !== file.raw);
const names = changes.map(({ file }) => file.path.slice(ROOT.length)).join(', ');

if (!changes.length) console.log('No changes.');
else if (!flags.write) console.log(`Dry run: nothing was written. With --write these would change: ${names}`);
else {
  for (const { file, text } of changes) writeFileSync(file.path, text);
  console.log(`Wrote ${names}.`);
  console.log("This is BE-1's content pack: bump the version in packages/content/manifest.json, run pnpm lint:content, and tell BE-1.");
}
