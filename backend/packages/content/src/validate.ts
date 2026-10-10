import type { ContentSource, Language } from '@paisa/contracts';
import { report, type ContentIssue, type ValidationReport } from './issues';
import { collectKeys } from './keys';
import { lintGuardrails, type LintableItem } from './lint';

/** Schema, cross-reference, string-coverage and guardrail checks over a whole source. (A7) */
export function validateSource(source: ContentSource): ValidationReport {
  const issues: ContentIssue[] = [];
  const add = (itemId: string, rule: string, message: string, severity: ContentIssue['severity'] = 'error') =>
    issues.push({ itemId, rule, message, severity });

  const items: LintableItem[] = [
    ...source.scenarios,
    ...source.events,
    ...source.quizQuestions,
    ...source.scamMessages,
    ...source.reflections,
  ];

  // Unique ids across every kind, so analytics can key on the id alone.
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) add(item.id, 'duplicate_id', `id "${item.id}" is used more than once`);
    seen.add(item.id);
  }
  const personaIds = new Set<string>();
  for (const p of source.personas) {
    if (personaIds.has(p.id)) add(p.id, 'duplicate_id', `persona "${p.id}" is defined more than once`);
    personaIds.add(p.id);
  }

  if (!source.tuning) {
    add('tuning', 'tuning_missing', 'tuning.json is required to build a playable pack');
  } else {
    const { weights } = source.tuning.score;
    if (weights.savingsRate + weights.emergencyFund + weights.goalProgress + weights.debt <= 0) {
      add('tuning', 'tuning_range', 'score weights must add up to more than 0');
    }
    const { bad, average, good } = source.tuning.projection;
    if (!(bad <= average && average <= good)) add('tuning', 'tuning_range', 'projection rates must be bad <= average <= good');
  }

  // Personas referenced by cards should exist; a pack can still ship cards for personas it does not define.
  if (source.personas.length > 0) {
    for (const card of [...source.scenarios, ...source.events]) {
      for (const p of card.personas) {
        if (!personaIds.has(p)) add(card.id, 'unknown_persona', `persona "${p}" is not defined in this source`, 'warning');
      }
    }
  }

  for (const p of source.personas) {
    if (p.income.pattern === 'irregular' && p.income.min > p.income.max) {
      add(p.id, 'tuning_range', 'irregular income min must be <= max');
    }
    const starter = source.scenarios.filter((s) => s.personas.includes(p.id) && s.difficulty === 1);
    const weeks = source.tuning?.weeksPerMonth ?? 4;
    if (starter.length < weeks) {
      add(p.id, 'thin_deck', `only ${starter.length} level-1 scenarios for ${p.id}; at least ${weeks} keep a month varied`, 'warning');
    }
  }

  const forms = { A: 0, B: 0 };
  for (const q of source.quizQuestions) forms[q.form] += 1;
  if (forms.A !== forms.B) add('quiz', 'quiz_forms', `form A has ${forms.A} questions and form B has ${forms.B}; parallel forms should match`, 'warning');

  // String coverage: English is the source language; every other language present must be complete.
  const en = source.strings.en;
  const used = new Set<string>();
  for (const item of items) collectKeys(item, used);
  for (const p of source.personas) collectKeys(p, used);
  if (!en) {
    add('strings', 'strings_missing', 'strings/en.json is required');
  }
  for (const [lang, table] of Object.entries(source.strings) as [Language, Record<string, string>][]) {
    for (const key of used) {
      if (!(key in table)) add(key, 'missing_string', `"t:${key}" has no ${lang} text`);
      else if (table[key]!.trim() === '') add(key, 'empty_string', `"t:${key}" is empty in ${lang}`);
    }
  }

  for (const item of items) issues.push(...lintGuardrails(item, source.strings));
  return report(issues);
}
