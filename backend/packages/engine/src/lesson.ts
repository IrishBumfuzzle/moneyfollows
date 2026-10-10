import { PILLARS, type GameContent, type GameState, type MonthReport, type Pillar, type Reflection } from '@paisa/contracts';
import { EngineError } from './errors';
import { moneyHealth } from './score';

/** The reflection for the month: about the pillar with the most risky picks, else a general one. */
export function pickReflection(state: GameState, content: GameContent): Reflection {
  const risky: Partial<Record<Pillar, number>> = {};
  for (const d of state.decisions) {
    if (d.month === state.month && d.rating === 'risky') risky[d.pillar] = (risky[d.pillar] ?? 0) + 1;
  }
  let top: Pillar | null = null;
  for (const p of PILLARS) {
    if ((risky[p] ?? 0) > (top ? (risky[top] ?? 0) : 0)) top = p;
  }
  const found =
    (top ? content.reflections.find((r) => r.pillar === top) : undefined) ??
    content.reflections.find((r) => r.pillar === undefined) ??
    content.reflections[0];
  if (!found) throw new EngineError('no_cards', 'the content pack has no reflection questions');
  return found;
}

/** The month-end report for the month so far. Pure, so the API can also use it for previews. */
export function monthReport(state: GameState, content: GameContent): MonthReport {
  const { score, parts, saved } = moneyHealth(state, content);
  const r = pickReflection(state, content);
  return {
    month: state.month,
    score,
    parts,
    income: state.monthStart.income,
    saved,
    reflection: { id: r.id, question: r.question, options: [...r.options] },
  };
}
