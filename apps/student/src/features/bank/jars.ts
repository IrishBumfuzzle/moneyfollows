// Jar Splitter at the Bank: practice only, never touches the wallet. Rounds and scoring come from
// the engine (jarSplitterRounds, scoreJarSplit, emptySplit) and BE-1's content pack.
import { emptySplit, jarSplitterRounds, scoreJarSplit } from '@paisa/engine';
import type { JarSplit, JarSplitResult } from '@paisa/engine';
import type { JarSplitRound } from '@paisa/content';
import type { JarId, Level, PersonaId } from '@paisa/shared';

export { emptySplit, scoreJarSplit };
export type { JarSplit, JarSplitResult, JarSplitRound };

/** Jar order on screen (CLAUDE.md 6: Needs teal, Wants amber, Goals purple, Savings green). */
export const JAR_ORDER: readonly JarId[] = ['needs', 'wants', 'goals', 'savings'];

/** This persona's rounds; the student app has no level yet, so 'starter'. */
export const roundsFor = (persona: PersonaId, level: Level = 'starter') => jarSplitterRounds(persona, level);

/**
 * Moves one jar to `value`, keeping it a whole multiple of the round's step, never below 0 and
 * never above what is left of the income (other jars stay as they are). Never mutates `split`.
 */
export function setJar(round: Pick<JarSplitRound, 'income' | 'step'>, split: JarSplit, jar: JarId, value: number): JarSplit {
  const others = JAR_ORDER.filter((j) => j !== jar).reduce((s, j) => s + split[j], 0);
  const room = Math.max(0, round.income - others);
  const snapped = Math.round(value / round.step) * round.step;
  return { ...split, [jar]: Math.min(room, Math.max(0, snapped)) };
}

/** Sum of a game's rounds: checks met, out of all checks. */
export function scoreGame(results: readonly JarSplitResult[]) {
  const correct = results.reduce((s, r) => s + r.passed, 0);
  const total = results.reduce((s, r) => s + r.checks.length, 0);
  return { correct, total, score: total ? Math.round((100 * correct) / total) : 0 };
}
