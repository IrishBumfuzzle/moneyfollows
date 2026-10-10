import type { EventCard, Language, QuizQuestion, Reflection, Scenario, ScamMessage, StringTable } from '@paisa/contracts';
import guardrails from './guardrails.json';
import type { ContentIssue } from './issues';
import { collectKeys } from './keys';

export type LintableItem = Scenario | EventCard | QuizQuestion | ScamMessage | Reflection;
export type LintStrings = Partial<Record<Language, StringTable>>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match that also works for Devanagari and other scripts.
const wordRe = (words: string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'iu');

const BRAND_RE = wordRe(guardrails.brands);
const PROMISE_RE = wordRe(guardrails.promises);
const SHAMING_RE = wordRe(guardrails.shaming);
const LINK_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|net|org|ly|io|co|app|xyz|info)\b(?:\/\S*)?/gi;
const PHONE_RE = /(?:\+91[\s-]?)?\b\d{10}\b|\b1800[\s-]?\d{3}[\s-]?\d{4}\b/g;
const PERCENT_RE = /\d+(?:\.\d+)?\s?%/g;

function isScam(item: LintableItem): item is ScamMessage {
  return 'segments' in item;
}

/** Which length cap applies to a key, from the key naming convention. */
function capFor(key: string): keyof typeof guardrails.lengthCaps | null {
  if (key.endsWith('.story')) return 'story';
  if (key.endsWith('.label')) return 'label';
  if (key.endsWith('.lesson')) return 'lesson';
  if (key.endsWith('.later')) return 'later';
  return null;
}

/**
 * Guardrail rules for one item: no real products or brands, no promises or
 * single-number returns, respectful tone, safe links only, length caps.
 * Structural checks run without strings; text checks run on every language given.
 */
export function lintGuardrails(item: LintableItem, strings: LintStrings | StringTable = {}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (rule: string, message: string, severity: ContentIssue['severity'] = 'error') =>
    issues.push({ itemId: item.id, rule, message, severity });

  const tables: LintStrings = isLangMap(strings) ? strings : { en: strings };
  const keys = [...collectKeys(item)];
  const investing = 'pillar' in item && item.pillar === 'understand_investing';

  if (investing && 'difficulty' in item && 'choices' in item && (item as Scenario).assumption !== true) {
    add('assumption_banner', 'investing scenarios must set "assumption": true so the app shows AssumptionBanner');
  }

  for (const [lang, table] of Object.entries(tables) as [Language, StringTable][]) {
    for (const key of keys) {
      const text = table[key];
      if (text === undefined) continue;
      const where = `${lang}:${key}`;

      const brand = text.match(BRAND_RE);
      if (brand) add('real_brand', `${where} names "${brand[1]}". Use fictional names only.`);
      // Scam messages quote the scammer's hook ("double your money") so students learn to spot it.
      const promise = isScam(item) ? null : text.match(PROMISE_RE);
      if (promise) add('promise', `${where} uses "${promise[1]}". Educate, never promise or recommend.`);
      const shame = text.match(SHAMING_RE);
      if (shame) add('tone', `${where} uses "${shame[1]}". Avoid shaming words.`, 'warning');

      // Scam messages show fake links and numbers on purpose, for the same reason.
      if (!isScam(item)) {
        for (const link of text.match(LINK_RE) ?? []) {
          if (!guardrails.allowedLinks.some((ok) => link.toLowerCase().includes(ok))) {
            add('link', `${where} links to "${link}". Only ${guardrails.allowedLinks.join(', ')} is allowed.`);
          }
        }
        for (const num of text.match(PHONE_RE) ?? []) {
          if (!guardrails.allowedNumbers.includes(num)) add('phone', `${where} has the number "${num}". Only 1930 is allowed.`);
        }
      }

      if (investing && (text.match(PERCENT_RE) ?? []).length === 1) {
        add('single_number', `${where} quotes a single percentage. Show a range of outcomes instead.`);
      }

      const cap = lang === 'en' ? capFor(key) : null;
      if (cap && text.length > guardrails.lengthCaps[cap]) {
        add('length', `${where} is ${text.length} characters; the ${cap} cap is ${guardrails.lengthCaps[cap]}.`);
      }
    }
  }
  return issues;
}

function isLangMap(s: LintStrings | StringTable): s is LintStrings {
  return Object.values(s).every((v) => typeof v === 'object' && v !== null);
}
