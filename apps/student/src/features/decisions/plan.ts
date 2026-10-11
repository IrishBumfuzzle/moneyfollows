// The persona's monthly money plan (four jars) on top of the engine (CLAUDE.md 5.2). Pure
// glue: every function takes a GameState and returns a new one; the shared store (useGame)
// calls these, components never touch the engine or mutate the plan themselves.
import { content, places } from '@paisa/content';
import { EngineError, choose, createGame, monthReport, playAt, pinsForWeek, rewind, sleepStep } from '@paisa/engine';
import type { SleepResult } from '@paisa/engine';
import type {
  AppliedEffects,
  Card,
  Choice,
  Consequence,
  GameState,
  JarId,
  LocationId,
  MonthReport,
  PersonaId,
  TKey,
} from '@paisa/shared';

export type { Consequence, GameState, MonthReport, SleepResult };

/** The Needs → Savings order every jar list uses. */
export const JAR_ORDER: JarId[] = ['needs', 'wants', 'goals', 'savings'];

/** A pinned place for the map: where, and the card waiting there. */
export interface PlanPin {
  location: LocationId;
  sublocation?: string;
  scenarioId: string;
}

/** A card the player can answer: a decision or a surprise event. */
export type PlayCard = Extract<Card, { kind: 'decision' | 'event' }>;

/** A fresh plan: the starter level, the month-1 payday already split into the jars. */
export function startPlan(persona: PersonaId, seed: number): GameState {
  return createGame(persona, 'starter', seed >>> 0, content);
}

/** A random seed for a new plan (0..2^31-1). The seed is saved with the plan. */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** The week's unplayed pins (empty at month end and after the last month). */
export function planPins(plan: GameState | null): PlanPin[] {
  if (!plan) return [];
  return pinsForWeek(plan, content);
}

/**
 * The pinned card at exactly this spot: a place itself (not inside its sub-map) or one
 * sub-map location. The Shop plays its own pins on the map and the sub-map's in the store.
 */
export function cardAt(plan: GameState | null, location: LocationId, sublocation?: string): PlayCard | null {
  if (!plan) return null;
  if (sublocation !== undefined) {
    const card = playAt(plan, content, location, sublocation);
    return card && (card.kind === 'decision' || card.kind === 'event') ? card : null;
  }
  const pin = planPins(plan).find((p) => p.location === location && p.sublocation === undefined);
  return pin ? cardFor(plan, pin.scenarioId) : null;
}

/** A place's sub-map locations (places.json), e.g. the Shop's phone shop, kirana and clothes stall. */
export function subPlaces(location: LocationId): string[] {
  return places.find((p) => p.id === location)?.children ?? [];
}

/** The card for one pinned scenario (to resume a scene, or play it from the "still to do" list). */
export function cardFor(plan: GameState | null, scenarioId: string): PlayCard | null {
  const pin = planPins(plan).find((p) => p.scenarioId === scenarioId);
  if (!plan || !pin) return null;
  const card = playAt(plan, content, pin.location, pin.sublocation);
  // Two pins can share a place: playAt returns the first, so fall back to a direct lookup.
  if (card && (card.kind === 'decision' || card.kind === 'event') && card.scenario.id === scenarioId) return card;
  const decision = content.scenarios.find((s) => s.id === scenarioId);
  if (decision) return { kind: 'decision', month: plan.month, week: plan.week, scenario: decision };
  const event = content.events.find((e) => e.id === scenarioId);
  return event ? { kind: 'event', month: plan.month, week: plan.week, scenario: event } : null;
}

/** Plays one choice on a pinned card. The week never ends here: only sleep ends it. */
export function planChoose(plan: GameState, scenarioId: string, choiceId: string) {
  return choose(plan, content, choiceId, { scenarioId });
}

/** Undo the last choice (one token). Null when there is nothing to undo or no token left. */
export function planRewind(plan: GameState): GameState | null {
  return rewind(plan);
}

export type SleepOutcome =
  | { kind: 'slept'; result: SleepResult }
  /** Pins are still to play this week: the week can't end yet. */
  | { kind: 'blocked'; pins: PlanPin[] }
  /** The plan's last month is over: nothing more happens overnight. */
  | { kind: 'over' };

/** Ends the plan's week (day 7 at Home): blocked while pins remain; at month end, starts the next month. */
export function planSleep(plan: GameState): SleepOutcome {
  try {
    return { kind: 'slept', result: sleepStep(plan, content) };
  } catch (e) {
    if (e instanceof EngineError && e.code === 'pins_remaining') return { kind: 'blocked', pins: planPins(plan) };
    if (e instanceof EngineError && e.code === 'game_over') return { kind: 'over' };
    throw e;
  }
}

/** True when the month is over and the Month Recap is waiting to be read. */
export const recapDue = (plan: GameState | null) => plan?.stage === 'monthEnd';

/** The Month Recap: score, its four parts and one reflection. */
export function planReport(plan: GameState): MonthReport {
  return monthReport(plan);
}

/** Jars that changed, in jar order, without zeros. */
export function jarChanges(applied: AppliedEffects): { jar: JarId; amount: number }[] {
  return JAR_ORDER.map((jar) => ({ jar, amount: applied.jars[jar] ?? 0 })).filter((c) => c.amount !== 0);
}

/**
 * The earlier choice behind a delayed effect. Notes are keyed "<scenarioId>.<choiceId>.later"
 * (or ".later2"), so the key names both. Null if the note doesn't follow that pattern.
 */
export function choiceOfNote(note: TKey): { scenarioId: string; choice: Choice } | null {
  const m = /^t:(.+)\.([^.]+)\.later\d*$/.exec(note);
  if (!m) return null;
  const [, scenarioId, choiceId] = m as unknown as [string, string, string];
  const card = content.scenarios.find((s) => s.id === scenarioId) ?? content.events.find((e) => e.id === scenarioId);
  const choice = card?.choices.find((c) => c.id === choiceId);
  return card && choice ? { scenarioId, choice } : null;
}

/** What a sleep or a choice landed from earlier choices (for flashbacks). */
export type Landed = Consequence['landed'];
