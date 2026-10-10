import {
  CONTINUE,
  DECISIONS_PER_WEEK,
  EARN_JAR,
  EVENT_CHANCE,
  GAME_MONTHS,
  JARS,
  REWIND_TOKENS_PER_MONTH,
  WEEKS_PER_MONTH,
} from '@paisa/shared';
import type {
  AppliedEffects,
  Card,
  Choice,
  ContentBundle,
  Consequence,
  Effects,
  EventCard,
  GameState,
  JarId,
  LocationId,
  PendingEffect,
  Persona,
  Scenario,
  Stage,
  TKey,
  WeekPin,
} from '@paisa/shared';
import { content as bundledContent } from '@paisa/content';
import { EngineError } from './errors';
import { unit } from './hash';
import { inFlightOf, monthReport } from './score';
import { pickEvent, pickWeekDecisions } from './selector';
import { applyToWallet } from './wallet';

type Landed = Consequence['landed'];

const stageOf = (state: GameState): Stage => state.stage ?? 'decision';
const absWeek = (month: number, week: number): number => (month - 1) * WEEKS_PER_MONTH + week;
const dueOf = (p: PendingEffect): number => absWeek(p.dueMonth, p.dueWeek);
const UINT32_MAX = 0xffffffff;

function cloneEffects(e: Effects): Effects {
  const out: Effects = {};
  if (e.jars) out.jars = { ...e.jars };
  if (e.debt !== undefined) out.debt = e.debt;
  if (e.flags) out.flags = [...e.flags];
  return out;
}

/** A private working copy. Everything the engine mutates is copied here first, so inputs stay untouched. */
function draftOf(state: GameState): GameState {
  const d: GameState = {
    ...state,
    jars: { ...state.jars },
    goal: { ...state.goal },
    flags: [...state.flags],
    seen: [...state.seen],
    pending: state.pending.map((p) => {
      const copy: PendingEffect = { ...p, effects: cloneEffects(p.effects) };
      if (p.principal) copy.principal = { ...p.principal };
      return copy;
    }),
    history: [...state.history],
    earned: [...(state.earned ?? [])],
    scores: [...(state.scores ?? [])],
    lessons: [...(state.lessons ?? [])],
  };
  if (state.pins) d.pins = state.pins.map((p) => ({ ...p }));
  if (state.monthStart) d.monthStart = { ...state.monthStart, jars: { ...state.monthStart.jars } };
  return d;
}

/** Runs effects through the wallet on the draft, adds flags (deduped) and keeps goal.progress in step. */
function applyEffects(d: GameState, effects: Effects): AppliedEffects {
  const r = applyToWallet(d.jars, d.debt, effects);
  d.jars = r.jars;
  d.debt = r.debt;
  d.goal.progress = d.jars.goals;
  for (const flag of effects.flags ?? []) if (!d.flags.includes(flag)) d.flags.push(flag);
  return r.applied;
}

function incomeFor(persona: Persona, seed: number, month: number): number {
  const p = persona.income;
  switch (p.pattern) {
    case 'steady':
      return p.amount;
    case 'seasonal':
      return Math.round(p.amount * (p.multipliers[(month - 1) % 12] ?? 1));
    case 'irregular': {
      const steps = Math.floor((p.max - p.min) / p.step) + 1;
      return p.min + p.step * Math.floor(unit(seed, 'income', month) * steps);
    }
  }
}

/** The persona's typical monthly income: a fallback denominator for a zero-income month. */
function baseIncomeOf(persona: Persona): number {
  const p = persona.income;
  return p.pattern === 'irregular' ? Math.round((p.min + p.max) / 2) : p.amount;
}

function findPersona(content: ContentBundle, id: GameState['personaId']): Persona {
  const persona = content.personas.find((p) => p.id === id);
  if (!persona) throw new EngineError('unknown_persona', `unknown persona: ${id}`);
  return persona;
}

function splitIncome(income: number, persona: Persona): Record<(typeof JARS)[number], number> {
  const shares = {} as Record<(typeof JARS)[number], number>;
  let allocated = 0;
  for (const jar of JARS) {
    shares[jar] = Math.floor((income * persona.split[jar]) / 100);
    allocated += shares[jar];
  }
  shares.needs += income - allocated; // remainder rupees go to Needs
  return shares;
}

/**
 * Month start: income split into jars, fixed costs out of Needs (borrowing if short), then
 * the month-end baseline. `paydaySaved` records what the split put into savings + goals so
 * the savings rate counts it; `needsBudget` is one month of Needs (the Needs share, which
 * already pays the fixed costs), taken from the persona's base income in a zero-income month.
 */
function payday(d: GameState, content: ContentBundle): NonNullable<Consequence['payday']> {
  const persona = findPersona(content, d.personaId);
  const income = incomeFor(persona, d.seed, d.month);
  const baseIncome = baseIncomeOf(persona);
  const shares = splitIncome(income, persona);
  const inFlight = inFlightOf(d.pending, 'savings') + inFlightOf(d.pending, 'goals');
  const applied = applyEffects(d, { jars: { ...shares, needs: shares.needs - persona.fixedCosts } });
  d.monthStart = {
    jars: { ...d.jars },
    debt: d.debt,
    income,
    needsBudget: income > 0 ? shares.needs : splitIncome(baseIncome, persona).needs,
    paydaySaved: (applied.jars.savings ?? 0) + (applied.jars.goals ?? 0),
    inFlight,
    baseIncome,
  };
  return { income, applied };
}

function pinOf(card: Scenario | EventCard, kind: WeekPin['kind']): WeekPin {
  const pin: WeekPin = { location: card.location, scenarioId: card.id, kind, played: false };
  if (card.sublocation !== undefined) pin.sublocation = card.sublocation;
  return pin;
}

/**
 * The week's pins (5.8): the surprise event first, if the week's roll gives one, then
 * DECISIONS_PER_WEEK[level] decisions at different places where possible. A pure function
 * of the state, so a save without `pins` (from before the map loop) gets the same pins back.
 */
function buildPins(state: GameState, content: ContentBundle): WeekPin[] {
  const pins: WeekPin[] = [];
  // An older save with stage 'event' already had its event roll succeed this week.
  const eventWeek =
    state.stage === 'event' || unit(state.seed, 'event', state.month, state.week) < EVENT_CHANCE[state.level];
  if (eventWeek) {
    const event = pickEvent(state, content);
    if (event) pins.push(pinOf(event, 'event'));
  }
  for (const s of pickWeekDecisions(state, content, DECISIONS_PER_WEEK[state.level])) pins.push(pinOf(s, 'decision'));
  return pins;
}

/** The week's pins: stored ones, or rebuilt for an older save. Empty outside a week. */
function pinsOf(state: GameState, content: ContentBundle): WeekPin[] {
  const stage = stageOf(state);
  if (stage === 'monthEnd' || stage === 'yearEnd') return [];
  return state.pins ?? buildPins(state, content);
}

const GATES_MESSAGE = (state: GameState): string =>
  `no scenario passes the persona, flag, difficulty and investing gates (${state.personaId}, ${state.level})`;

/** 'event' while the week's surprise event is still unplayed (it is answered first in the classic loop), else 'decision'. */
function weekStage(pins: WeekPin[]): Stage {
  return pins.some((p) => p.kind === 'event' && !p.played) ? 'event' : 'decision';
}

/** Start of a week: due delayed effects land, then the week's pins are chosen. */
function startWeek(d: GameState, content: ContentBundle, landed: Landed): void {
  const now = absWeek(d.month, d.week);
  const due = d.pending.filter((p) => dueOf(p) <= now);
  d.pending = d.pending.filter((p) => dueOf(p) > now);
  for (const p of due) landed.push({ note: p.note, applied: applyEffects(d, p.effects) });

  d.stage = 'decision';
  d.pins = buildPins(d, content);
  d.stage = weekStage(d.pins);
}

/** End of a week (sleep, or the last pin in the classic loop): the next week starts, or the month ends. */
function endWeek(d: GameState, content: ContentBundle, landed: Landed): void {
  if (d.week < WEEKS_PER_MONTH) {
    d.week += 1;
    startWeek(d, content, landed);
  } else {
    d.stage = 'monthEnd';
    d.pins = [];
    d.score = monthReport(d).score;
    (d.scores as number[]).push(d.score);
  }
}

/** Year end: every effect still pending lands now (oldest due first), so no queued money is lost. */
function settleAll(d: GameState, landed: Landed): void {
  const due = d.pending
    .map((p, i) => ({ p, i }))
    .sort((a, b) => dueOf(a.p) - dueOf(b.p) || a.i - b.i)
    .map((x) => x.p);
  d.pending = [];
  for (const p of due) landed.push({ note: p.note, applied: applyEffects(d, p.effects) });
}

function beginMonth(d: GameState, content: ContentBundle, landed: Landed): NonNullable<Consequence['payday']> {
  const p = payday(d, content);
  startWeek(d, content, landed);
  return p;
}

export function createGame(
  personaId: GameState['personaId'],
  level: GameState['level'],
  seed: number,
  content: ContentBundle = bundledContent,
): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new EngineError('invalid_seed', `seed must be an integer in 0..${UINT32_MAX}: ${seed}`);
  }
  const persona = findPersona(content, personaId);
  const d: GameState = {
    version: 1,
    personaId,
    level,
    seed,
    month: 1,
    week: 1,
    jars: { ...persona.startingJars },
    debt: 0,
    goal: { amount: persona.goal.amount, progress: persona.startingJars.goals },
    flags: [],
    seen: [],
    pending: [],
    rewindTokens: REWIND_TOKENS_PER_MONTH,
    history: [],
    earned: [],
    stage: 'decision',
    scores: [],
    lessons: [],
  };
  beginMonth(d, content, []);
  return d;
}

/** The card for the current stage. A pure query: same state and content always give the same card. */
export function nextCard(state: GameState, content: ContentBundle): Card {
  switch (stageOf(state)) {
    case 'yearEnd':
      return {
        kind: 'yearEnd',
        scores: [...(state.scores ?? [])],
        goalReached: state.goal.progress >= state.goal.amount,
      };
    case 'monthEnd':
      return { kind: 'monthEnd', month: state.month, report: monthReport(state) };
    case 'event':
    case 'decision': {
      const pins = pinsOf(state, content);
      const pin = pins.find((p) => !p.played);
      if (!pin) {
        if (pins.length === 0) throw new EngineError('no_cards', GATES_MESSAGE(state));
        throw new EngineError('sleep_required', 'every pin this week is played: sleep to end the week');
      }
      return cardOfPin(state, content, pin);
    }
  }
}

function cardOfPin(state: GameState, content: ContentBundle, pin: WeekPin): Card {
  if (pin.kind === 'event') {
    const scenario = content.events.find((e) => e.id === pin.scenarioId);
    if (!scenario) throw new EngineError('no_cards', `pinned event is not in the content: ${pin.scenarioId}`);
    return { kind: 'event', month: state.month, week: state.week, scenario };
  }
  const scenario = content.scenarios.find((s) => s.id === pin.scenarioId);
  if (!scenario) throw new EngineError('no_cards', `pinned scenario is not in the content: ${pin.scenarioId}`);
  return { kind: 'decision', month: state.month, week: state.week, scenario };
}

/** The week's unplayed pins, for the map (5.2). Empty at month end and year end. */
export function pinsForWeek(
  state: GameState,
  content: ContentBundle,
): { location: LocationId; sublocation?: string; scenarioId: string }[] {
  return pinsOf(state, content)
    .filter((p) => !p.played)
    .map((p) => {
      const out: { location: LocationId; sublocation?: string; scenarioId: string } = {
        location: p.location,
        scenarioId: p.scenarioId,
      };
      if (p.sublocation !== undefined) out.sublocation = p.sublocation;
      return out;
    });
}

/**
 * The pinned card at a place, if any (5.2). With a sublocation, only a pin there; with just a
 * place, any pin at that place or inside its sub-map, in pin order. A pure query.
 */
export function playAt(
  state: GameState,
  content: ContentBundle,
  location: LocationId,
  sublocation?: string,
): Card | null {
  const pin = pinsOf(state, content).find(
    (p) => !p.played && p.location === location && (sublocation === undefined || p.sublocation === sublocation),
  );
  return pin ? cardOfPin(state, content, pin) : null;
}

function snapshotOf(state: GameState): Omit<GameState, 'history'> {
  const { history: _history, ...snapshot } = state;
  return snapshot;
}

/**
 * Plays a choice on a card (5.2). Without `target` it plays the next unplayed pin, and after
 * the last pin it ends the week itself: the classic one-card-at-a-time loop. With
 * `target.scenarioId` (the map loop) it plays that pin, in any order, and the week only ends
 * with sleep(). At month end only CONTINUE is accepted; it starts the next month (payday).
 */
export function choose(
  state: GameState,
  content: ContentBundle,
  choiceId: string,
  target?: { scenarioId: string },
): { state: GameState; consequence: Consequence } {
  const stage = stageOf(state);
  if (stage === 'yearEnd') throw new EngineError('game_over', 'the year is over');

  if (stage === 'monthEnd') {
    if (choiceId !== CONTINUE) throw new EngineError('unknown_choice', `month end only accepts "${CONTINUE}"`);
    const d = draftOf(state);
    const landed: Landed = [];
    let paydayInfo: Consequence['payday'];
    if (d.month >= GAME_MONTHS) {
      d.stage = 'yearEnd';
      settleAll(d, landed);
    } else {
      d.month += 1;
      d.week = 1;
      d.rewindTokens = REWIND_TOKENS_PER_MONTH;
      d.history = [];
      paydayInfo = beginMonth(d, content, landed);
    }
    const consequence: Consequence = {
      card: 'monthEnd',
      choiceId: CONTINUE,
      applied: { jars: {}, debt: 0, borrowed: 0 },
      delayedQueued: 0,
      landed,
    };
    if (paydayInfo) consequence.payday = paydayInfo;
    return { state: d, consequence };
  }

  const pins = pinsOf(state, content);
  const pinIndex = target
    ? pins.findIndex((p) => !p.played && p.scenarioId === target.scenarioId)
    : pins.findIndex((p) => !p.played);
  if (pinIndex < 0) {
    if (target) throw new EngineError('not_pinned', `not an unplayed pin this week: ${target.scenarioId}`);
    if (pins.length === 0) throw new EngineError('no_cards', GATES_MESSAGE(state));
    throw new EngineError('sleep_required', 'every pin this week is played: sleep to end the week');
  }
  const card = cardOfPin(state, content, pins[pinIndex]!);
  if (card.kind !== 'decision' && card.kind !== 'event') throw new EngineError('no_cards');
  const choice: Choice | undefined = card.scenario.choices.find((c) => c.id === choiceId);
  if (!choice) throw new EngineError('unknown_choice', `unknown choice: ${choiceId}`);

  const d = draftOf(state);
  d.history.push(snapshotOf(state));
  d.pins = pins.map((p, i) => (i === pinIndex ? { ...p, played: true } : { ...p }));
  const applied = applyEffects(d, choice.effects);

  // Principal this choice took from savings/goals. Delayed inflows to the same jar pay it
  // back, so that part counts as still saved for the score while it is in flight.
  const owed = {
    savings: Math.max(0, -(applied.jars.savings ?? 0)),
    goals: Math.max(0, -(applied.jars.goals ?? 0)),
  };
  const now = absWeek(d.month, d.week);
  let delayedQueued = 0;
  for (const delayed of choice.delayed ?? []) {
    // An effect due after the last week stays queued and settles when the year ends.
    const due = now + delayed.afterWeeks;
    const pending: PendingEffect = {
      dueMonth: Math.floor((due - 1) / WEEKS_PER_MONTH) + 1,
      dueWeek: ((due - 1) % WEEKS_PER_MONTH) + 1,
      effects: cloneEffects(delayed.effects),
      note: delayed.note,
    };
    const principal: NonNullable<PendingEffect['principal']> = {};
    for (const jar of ['savings', 'goals'] as const) {
      const back = Math.min(owed[jar], Math.max(0, delayed.effects.jars?.[jar] ?? 0));
      if (back > 0) {
        principal[jar] = back;
        owed[jar] -= back;
      }
    }
    if (Object.keys(principal).length > 0) pending.principal = principal;
    d.pending.push(pending);
    delayedQueued++;
  }
  d.seen.push(card.scenario.id);
  const lessons = d.lessons as TKey[];
  if (!lessons.includes(choice.lesson)) lessons.push(choice.lesson);

  const landed: Landed = [];
  d.stage = weekStage(d.pins);
  if (!target && d.pins.every((p) => p.played)) endWeek(d, content, landed);

  const consequence: Consequence = {
    card: card.kind,
    scenarioId: card.scenario.id,
    choiceId,
    lesson: choice.lesson,
    applied,
    delayedQueued,
    landed,
  };
  return { state: d, consequence };
}

/**
 * Sleep at Home (5.2, 5.8): ends the week. Blocked (EngineError 'pins_remaining') while any
 * of the week's pins is unplayed (rule 8). After week 4 it opens the month-end report; at
 * the month-end report it starts the next month, with payday, like choosing CONTINUE.
 */
export function sleep(state: GameState, content: ContentBundle): GameState {
  return sleepStep(state, content).state;
}

/** What happened overnight: delayed effects that landed (flashbacks) and, after the month-end report, payday. */
export interface SleepResult {
  state: GameState;
  landed: Consequence['landed'];
  payday?: Consequence['payday'];
}

/** sleep(), plus what it did, so the UI can show flashbacks and payday. Same rules and errors as sleep. */
export function sleepStep(state: GameState, content: ContentBundle): SleepResult {
  const stage = stageOf(state);
  if (stage === 'yearEnd') throw new EngineError('game_over', 'the year is over');
  if (stage === 'monthEnd') {
    const r = choose(state, content, CONTINUE);
    const out: SleepResult = { state: r.state, landed: r.consequence.landed };
    if (r.consequence.payday) out.payday = r.consequence.payday;
    return out;
  }
  const pins = pinsOf(state, content);
  const left = pins.filter((p) => !p.played).length;
  if (left > 0) throw new EngineError('pins_remaining', `${left} pin(s) still to play this week`);
  const d = draftOf(state);
  d.pins = pins.map((p) => ({ ...p }));
  const landed: Landed = [];
  endWeek(d, content, landed);
  return { state: d, landed };
}

/**
 * Pays earned income, e.g. the paper-route wage: earn(state, wage, "news:2026-W41:upi_fraud").
 * Idempotent per sourceId (rule 7): a source that already paid returns the state unchanged.
 * The money goes into `jar` (Wants unless named). Rewinding past it undoes it along with its id.
 */
export function earn(state: GameState, amount: number, sourceId: string, jar: JarId = EARN_JAR): GameState {
  if (stageOf(state) === 'yearEnd') throw new EngineError('game_over', 'the year is over');
  if (!Number.isInteger(amount) || amount < 0) {
    throw new EngineError('invalid_earn', `amount must be whole rupees >= 0: ${amount}`);
  }
  if (sourceId.length === 0) throw new EngineError('invalid_earn', 'sourceId is required');
  if ((state.earned ?? []).includes(sourceId)) return state;
  const d = draftOf(state);
  if (amount > 0) applyEffects(d, { jars: { [jar]: amount } });
  d.earned.push(sourceId);
  return d;
}

/** Undo the last choice of this month. Null with no tokens, no snapshot, or once the year is over. */
export function rewind(state: GameState): GameState | null {
  if (stageOf(state) === 'yearEnd') return null;
  if (state.rewindTokens <= 0 || state.history.length === 0) return null;
  const history = state.history.slice(0, -1);
  const snapshot = state.history[state.history.length - 1] as Omit<GameState, 'history'>;
  return { ...snapshot, history, rewindTokens: state.rewindTokens - 1 };
}
