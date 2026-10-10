// Pure event rules, like the engine (no clock, no randomness, inputs never mutated).
import { lifeApi } from '../life/life';
import type { LifeOutcome, LifeState } from '../life/types';
import { SCHEDULE } from './data';
import type { EventChoice, GameEvent } from './types';

/** Scheduled events due at `steps` that have not been delivered yet, in schedule order. */
export function dueIds(steps: number, fired: readonly string[]): string[] {
  return SCHEDULE.filter((s) => s.step <= steps && !fired.includes(s.id)).map((s) => s.id);
}

/** False when a choice spends money the player doesn't have and can't be taken short. */
export function canChoose(life: LifeState, choice: EventChoice): boolean {
  return (choice.ifShort ?? 'block') === 'all' || life.money >= -(choice.effects.money ?? 0);
}

/** Applies one choice of an event. Null for an unknown choice. */
export function resolveChoice<S extends LifeState>(life: S, event: GameEvent, choiceId: string): LifeOutcome<S> | null {
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) return null;
  return lifeApi.applyEffects(life, choice.effects, choice.ifShort ?? 'block');
}
