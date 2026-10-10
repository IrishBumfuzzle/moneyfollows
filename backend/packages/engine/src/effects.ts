import type { AppliedEffects, Effects, GameState, JarDeltas, PendingEffect } from '@paisa/contracts';
import { finalWeek } from './clock';
import type { Out } from './internal';
import { applyEffects } from './wallet';
import type { Tuning } from '@paisa/contracts';

/** Applies deltas through the wallet and tells the player if a jar ran dry and money was borrowed. */
export function spend(
  state: GameState,
  deltas: JarDeltas,
  debtDelta: number,
  out: Out,
): { state: GameState; applied: AppliedEffects } {
  const r = applyEffects(state.jars, state.debt, deltas, debtDelta);
  if (r.applied.borrowed > 0) out.notices.push({ kind: 'borrowed', amount: r.applied.borrowed });
  return { state: { ...state, jars: r.jars, debt: r.debt }, applied: r.applied };
}

function jarDeltasOf(e: { needs?: number | undefined; wants?: number | undefined; goals?: number | undefined; savings?: number | undefined }): JarDeltas {
  const d: JarDeltas = {};
  if (e.needs !== undefined) d.needs = e.needs;
  if (e.wants !== undefined) d.wants = e.wants;
  if (e.goals !== undefined) d.goals = e.goals;
  if (e.savings !== undefined) d.savings = e.savings;
  return d;
}

/** Applies a choice's effects now and returns the delayed ones that still land inside the year. */
export function resolveChoice(
  state: GameState,
  effects: Effects,
  sourceId: string,
  now: number,
  tuning: Tuning,
  out: Out,
): { state: GameState; applied: AppliedEffects; queued: PendingEffect[] } {
  const { state: spent, applied } = spend(state, jarDeltasOf(effects), effects.debt ?? 0, out);
  const last = finalWeek(tuning);
  const queued: PendingEffect[] = [];
  for (const d of effects.delayed ?? []) {
    const due = now + d.afterWeeks;
    if (due > last) continue;
    queued.push({ due, sourceId, deltas: jarDeltasOf(d), debt: d.debt ?? 0, text: d.text });
  }
  return { state: spent, applied, queued };
}

/** Fires every delayed effect due on or before `now`, in the order they were queued. */
export function firePending(state: GameState, now: number, out: Out): GameState {
  let s = state;
  const waiting: PendingEffect[] = [];
  for (const p of state.pending) {
    if (p.due > now) {
      waiting.push(p);
      continue;
    }
    const r = spend(s, p.deltas, p.debt, out);
    s = r.state;
    out.notices.push({ kind: 'delayed_effect', text: p.text, deltas: r.applied.deltas, debt: r.applied.debt });
  }
  return { ...s, pending: waiting };
}
