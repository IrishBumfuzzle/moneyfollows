// Demo hooks for the hidden demo panel (CLAUDE.md 9). Never used in normal play. They only go
// through the store's plan actions (and lifeApi for the day), like a player would.
import { content } from '@paisa/content';
import { useGame } from '../../game/useGame';
import { lifeApi } from '../life/life';
import { cardFor, planPins, recapDue } from './plan';

/** Plays the first choice on every pin left, then ends the week (the life week moves too). */
export function endWeekNow(): void {
  const store = useGame.getState();
  if (!store.plan || recapDue(store.plan)) return;
  for (const pin of planPins(store.plan)) {
    const card = cardFor(useGame.getState().plan, pin.scenarioId);
    if (card) useGame.getState().choosePlan(pin.scenarioId, card.scenario.choices[0]!.id);
  }
  if (useGame.getState().sleepPlan()?.kind !== 'slept') return;
  // Rest through to the first day of the next week, so the day and the plan stay in step.
  const week = useGame.getState().life.week;
  for (let i = 0; i < 7 && useGame.getState().life.week === week; i++) {
    useGame.getState().apply(lifeApi.rest(useGame.getState().life));
  }
}

/** Ends weeks until the month is over: the Month Recap shows on the map. */
export function openRecap(): void {
  for (let i = 0; i < 4 && !recapDue(useGame.getState().plan); i++) endWeekNow();
}

/**
 * Shows a flashback now: the next delayed effect waiting in the plan, or else the first one in
 * the content pack. Display only: no money moves.
 */
export function fireFlashback(): void {
  const pending = useGame.getState().plan?.pending[0];
  const sample = content.scenarios.flatMap((s) => s.choices.flatMap((c) => c.delayed ?? []))[0];
  const from = pending ?? sample;
  if (!from) return;
  const { jars = {}, debt = 0 } = from.effects;
  useGame.setState((s) => ({
    overnight: { id: (s.overnight?.id ?? 0) + 1, landed: [{ note: from.note, applied: { jars, debt, borrowed: 0 } }] },
  }));
}
