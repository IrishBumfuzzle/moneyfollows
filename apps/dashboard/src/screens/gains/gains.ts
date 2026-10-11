// Pure helpers for the Learning gains screen: no DOM, no network, so they run under vitest.
import type { MatchedLearningGainRow } from '@paisa/api-client';
import { PILLARS, type ClassroomQuizSummaryRow, type Pillar } from '@paisa/shared';
import type { Dict, Lang } from '../../i18n';

export type GainRow = MatchedLearningGainRow;

/** A pillar's scores can only be shown when matched students answered it in both quizzes. */
const isMatched = (r: GainRow) => r.n > 0 && r.baseline_avg !== null && r.endline_avg !== null;

/** True when no pillar has a matched student: the chart would be empty. */
export const hasNoGains = (rows: readonly GainRow[]) => !rows.some(isMatched);

/** One row per pillar in the fixed display order; a pillar the API left out reads as "no data". */
export function orderRows(rows: readonly GainRow[]): GainRow[] {
  return PILLARS.map(
    (pillar) =>
      rows.find((r) => r.pillar === pillar) ?? {
        pillar,
        baseline_avg: null,
        endline_avg: null,
        baseline_n: 0,
        endline_n: 0,
        n: 0,
      },
  );
}

export interface GainsSummary {
  /** Mean of the whole-percent values the bars show, over the pillars with data, rounded. */
  from: number;
  to: number;
  /** Matched students: the most any one pillar has (a student answers every pillar, so that is the headcount). */
  students: number;
  direction: 'up' | 'down' | 'same';
}

/** The one-line takeaway; null when there is nothing matched yet. */
export function summarizeGains(rows: readonly GainRow[]): GainsSummary | null {
  const used = rows.filter(isMatched);
  if (used.length === 0) return null;
  // Average the numbers printed on the bars, so anyone checking the sentence against the chart gets the same.
  const mean = (pick: (r: GainRow) => number | null) =>
    Math.round(used.reduce((sum, r) => sum + Math.round(pick(r) ?? 0), 0) / used.length);
  const from = mean((r) => r.baseline_avg);
  const to = mean((r) => r.endline_avg);
  return {
    from,
    to,
    students: Math.max(...used.map((r) => r.n)),
    direction: to > from ? 'up' : to < from ? 'down' : 'same',
  };
}

export interface ChartDatum {
  pillar: Pillar;
  baseline: number | null;
  endline: number | null;
  n: number;
}

/** Chart rows in pillar order; a pillar without matched students gets no bars. */
export function chartData(rows: readonly GainRow[]): ChartDatum[] {
  return orderRows(rows).map((r) => {
    const ok = isMatched(r);
    return { pillar: r.pillar, baseline: ok ? r.baseline_avg : null, endline: ok ? r.endline_avg : null, n: r.n };
  });
}

/** Splits an axis label into short lines (SVG text does not wrap); the last line takes any overflow. */
export function wrapLabel(label: string, maxChars = 14, maxLines = 3): string[] {
  const lines: string[] = [];
  for (const word of label.split(/\s+/).filter(Boolean)) {
    const last = lines.length - 1;
    if (last >= 0 && (lines[last].length + 1 + word.length <= maxChars || lines.length === maxLines)) {
      lines[last] += ` ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

// ---- Where the class is struggling ----

/** Lowest percent correct first; ties go to the question most students tried, then by id so the order is stable. */
export function sortStruggles(rows: readonly ClassroomQuizSummaryRow[]): ClassroomQuizSummaryRow[] {
  return [...rows].sort(
    (a, b) => a.correct_pct - b.correct_pct || b.attempts - a.attempts || a.question_id.localeCompare(b.question_id),
  );
}

/** The content pack's dictionaries, per language; lookups fall back to English like makeT. */
export type PackDicts = Partial<Record<Lang, Dict>>;
const lookup = (dicts: PackDicts, lang: Lang, key: string) => dicts[lang]?.[key] ?? dicts.en?.[key];

/** Question text: the id plus `.q` in the content pack; the raw id when the pack has no such key. */
export const questionText = (dicts: PackDicts, lang: Lang, questionId: string) =>
  lookup(dicts, lang, `${questionId}.q`) ?? questionId;

/**
 * The most-picked wrong option. `choice` is a 0-based index in content order, which is how the
 * pack numbers its options (`.o1`, `.o2`, ...). Null when nobody got it wrong. `text` is null
 * when the pack has no such key, so the screen can fall back to "Option 2".
 */
export function wrongAnswer(
  dicts: PackDicts,
  lang: Lang,
  questionId: string,
  choice: number | null,
): { position: number; text: string | null } | null {
  if (choice === null) return null;
  const position = choice + 1;
  return { position, text: lookup(dicts, lang, `${questionId}.o${position}`) ?? null };
}

// ---- By concept: practice answers grouped by the idea each question checks ----

export interface ConceptRow {
  concept: string;
  pillar: ClassroomQuizSummaryRow['pillar'];
  /** Practice questions the class answered for this concept. */
  questions: number;
  /** Answers across those questions; every round counts. */
  answers: number;
  /** Percent of those answers that were right, weighted by answers. */
  correct_pct: number;
}

/**
 * Groups classroom_quiz_summary rows by concept, weakest first. A question the map doesn't know
 * (content changed since) is left out rather than guessed.
 */
export function conceptRows(
  rows: readonly ClassroomQuizSummaryRow[],
  conceptOf: Readonly<Record<string, string>>,
): ConceptRow[] {
  const groups = new Map<string, ConceptRow & { right: number }>();
  for (const r of rows) {
    const concept = conceptOf[r.question_id];
    if (!concept) continue;
    const g = groups.get(concept) ?? { concept, pillar: r.pillar, questions: 0, answers: 0, correct_pct: 0, right: 0 };
    g.questions += 1;
    g.answers += r.attempts;
    g.right += (r.correct_pct / 100) * r.attempts;
    groups.set(concept, g);
  }
  return [...groups.values()]
    .map(({ right, ...g }) => ({ ...g, correct_pct: g.answers > 0 ? Math.round((1000 * right) / g.answers) / 10 : 0 }))
    .sort((a, b) => a.correct_pct - b.correct_pct || b.answers - a.answers || a.concept.localeCompare(b.concept));
}

/** A concept's name from the content pack (concept.<id>.name); the raw id when the pack has none. */
export const conceptName = (dicts: PackDicts, lang: Lang, concept: string) =>
  lookup(dicts, lang, `concept.${concept}.name`) ?? concept;
