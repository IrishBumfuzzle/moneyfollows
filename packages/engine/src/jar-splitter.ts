// Jar Splitter mini-game (CLAUDE.md section 2 "Should"): split one payday into the four jars,
// then see which of the round's checks the split meets. Practice only: nothing here touches
// GameState. Pure: same round and split always give the same result.
import { JARS } from '@paisa/shared';
import type { GameState, JarId, TKey } from '@paisa/shared';
import { jarSplitRounds as bundledRounds, type JarSplitRound } from '@paisa/content';
import { EngineError } from './errors';

export type JarSplit = Record<JarId, number>;

export interface JarCheckResult {
  id: string;
  ok: boolean;
  /** The round's ok or fix key, filled with `values` ({{amount}}, {{short}}, {{percent}}). */
  feedback: TKey;
  values: { amount: number; short: number; percent?: number };
}

export interface JarSplitResult {
  /** Rupees placed in the jars. */
  total: number;
  /** Rupees still to place; negative when the split is more than the income. */
  remaining: number;
  /** Every rupee is placed, no more and no less. */
  complete: boolean;
  checks: JarCheckResult[];
  /** Checks met, for minigame_complete { correct: passed, total: checks.length }. */
  passed: number;
  /** Complete and every check met. */
  allPassed: boolean;
}

/** The rounds this persona and level can play, in file order. */
export function jarSplitterRounds(
  personaId: GameState['personaId'],
  level: GameState['level'],
  rounds: JarSplitRound[] = bundledRounds,
): JarSplitRound[] {
  return rounds.filter((r) => r.personas.includes(personaId) && r.levels.includes(level));
}

/** An empty split to start the sliders from. */
export function emptySplit(): JarSplit {
  return { needs: 0, wants: 0, goals: 0, savings: 0 };
}

const sumOf = (split: JarSplit, jars: readonly JarId[]): number => jars.reduce((s, j) => s + split[j], 0);

/** Checks a split against a round. Throws `invalid_split` unless every jar is a whole number of rupees ≥ 0. */
export function scoreJarSplit(round: JarSplitRound, split: JarSplit): JarSplitResult {
  for (const jar of JARS) {
    const v = split[jar];
    if (!Number.isInteger(v) || v < 0) {
      throw new EngineError('invalid_split', `${jar} must be whole rupees ≥ 0: ${String(v)}`);
    }
  }
  const total = sumOf(split, JARS);
  const income = round.income;

  const checks = round.checks.map((check): JarCheckResult => {
    let ok: boolean;
    let values: JarCheckResult['values'];
    switch (check.kind) {
      case 'min_jar': {
        const have = split[check.jar];
        ok = have >= check.amount;
        values = { amount: check.amount, short: Math.max(0, check.amount - have) };
        break;
      }
      case 'min_share': {
        const have = sumOf(split, check.jars);
        const needed = Math.ceil((income * check.percent) / 100);
        ok = have * 100 >= income * check.percent;
        values = { amount: needed, short: Math.max(0, needed - have), percent: check.percent };
        break;
      }
      case 'max_share': {
        const have = sumOf(split, check.jars);
        const limit = Math.floor((income * check.percent) / 100);
        ok = have * 100 <= income * check.percent;
        values = { amount: limit, short: Math.max(0, have - limit), percent: check.percent };
        break;
      }
    }
    return { id: check.id, ok, feedback: ok ? check.ok : check.fix, values };
  });

  const passed = checks.filter((c) => c.ok).length;
  const complete = total === income;
  return {
    total,
    remaining: income - total,
    complete,
    checks,
    passed,
    allPassed: complete && passed === checks.length,
  };
}
