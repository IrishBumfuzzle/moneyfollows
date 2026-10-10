import { CONTINUE, EVENT_CHANCE, GAME_MONTHS, JARS, REWIND_TOKENS_PER_MONTH, WEEKS_PER_MONTH } from '@paisa/shared';
import type {
  AppliedEffects,
  Card,
  Choice,
  ContentBundle,
  Consequence,
  Effects,
  GameState,
  Persona,
  Stage,
  TKey,
} from '@paisa/shared';
import { content as bundledContent } from '@paisa/content';
import { EngineError } from './errors';
import { unit } from './hash';
import { monthReport } from './score';
import { eligibleEvents, pickDecision, pickEvent } from './selector';
import { applyToWallet } from './wallet';

type Landed = Consequence['landed'];

const stageOf = (state: GameState): Stage => state.stage ?? 'decision';
const absWeek = (month: number, week: number): number => (month - 1) * WEEKS_PER_MONTH + week;
const lastWeek = GAME_MONTHS * WEEKS_PER_MONTH;

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
    pending: state.pending.map((p) => ({ ...p, effects: cloneEffects(p.effects) })),
    history: [...state.history],
    scores: [...(state.scores ?? [])],
    lessons: [...(state.lessons ?? [])],
  };
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

function findPersona(content: ContentBundle, id: GameState['personaId']): Persona {
  const persona = content.personas.find((p) => p.id === id);
  if (!persona) throw new EngineError('unknown_persona', `unknown persona: ${id}`);
  return persona;
}

/** Month start: income split into jars, fixed costs out of Needs (borrowing if short), then the month-end baseline. */
function payday(d: GameState, content: ContentBundle): NonNullable<Consequence['payday']> {
  const persona = findPersona(content, d.personaId);
  const income = incomeFor(persona, d.seed, d.month);
  const shares = {} as Record<(typeof JARS)[number], number>;
  let allocated = 0;
  for (const jar of JARS) {
    shares[jar] = Math.floor((income * persona.split[jar]) / 100);
    allocated += shares[jar];
  }
  shares.needs += income - allocated; // remainder rupees go to Needs
  const applied = applyEffects(d, { jars: { ...shares, needs: shares.needs - persona.fixedCosts } });
  d.monthStart = {
    jars: { ...d.jars },
    debt: d.debt,
    income,
    needsBudget: persona.fixedCosts + Math.round((income * persona.split.needs) / 100),
  };
  return { income, applied };
}

/** Start of a week: due delayed effects land, then the week's surprise-event roll sets the stage. */
function startWeek(d: GameState, content: ContentBundle, landed: Landed): void {
  const now = absWeek(d.month, d.week);
  const due = d.pending.filter((p) => absWeek(p.dueMonth, p.dueWeek) <= now);
  d.pending = d.pending.filter((p) => absWeek(p.dueMonth, p.dueWeek) > now);
  for (const p of due) landed.push({ note: p.note, applied: applyEffects(d, p.effects) });

  const roll = unit(d.seed, 'event', d.month, d.week) < EVENT_CHANCE[d.level];
  d.stage = roll && eligibleEvents(d, content).length > 0 ? 'event' : 'decision';
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
      return { kind: 'yearEnd', scores: [...(state.scores ?? [])], goalReached: state.jars.goals >= state.goal.amount };
    case 'monthEnd':
      return { kind: 'monthEnd', month: state.month, report: monthReport(state) };
    case 'event': {
      const scenario = pickEvent(state, content);
      if (!scenario) throw new EngineError('no_cards', 'no eligible event');
      return { kind: 'event', month: state.month, week: state.week, scenario };
    }
    case 'decision': {
      const scenario = pickDecision(state, content);
      if (!scenario) throw new EngineError('no_cards', 'no eligible scenario');
      return { kind: 'decision', month: state.month, week: state.week, scenario };
    }
  }
}

function snapshotOf(state: GameState): Omit<GameState, 'history'> {
  const { history: _history, ...snapshot } = state;
  return snapshot;
}

export function choose(
  state: GameState,
  content: ContentBundle,
  choiceId: string,
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

  const card = nextCard(state, content);
  if (card.kind !== 'decision' && card.kind !== 'event') throw new EngineError('no_cards');
  const choice: Choice | undefined = card.scenario.choices.find((c) => c.id === choiceId);
  if (!choice) throw new EngineError('unknown_choice', `unknown choice: ${choiceId}`);

  const d = draftOf(state);
  d.history.push(snapshotOf(state));
  const applied = applyEffects(d, choice.effects);

  const now = absWeek(d.month, d.week);
  let delayedQueued = 0;
  for (const delayed of choice.delayed ?? []) {
    const due = now + delayed.afterWeeks;
    if (due > lastWeek) continue; // would land after the game ends
    d.pending.push({
      dueMonth: Math.floor((due - 1) / WEEKS_PER_MONTH) + 1,
      dueWeek: ((due - 1) % WEEKS_PER_MONTH) + 1,
      effects: cloneEffects(delayed.effects),
      note: delayed.note,
    });
    delayedQueued++;
  }
  d.seen.push(card.scenario.id);
  const lessons = d.lessons as TKey[];
  if (!lessons.includes(choice.lesson)) lessons.push(choice.lesson);

  const landed: Landed = [];
  if (card.kind === 'event') {
    d.stage = 'decision';
  } else if (d.week < WEEKS_PER_MONTH) {
    d.week += 1;
    startWeek(d, content, landed);
  } else {
    d.stage = 'monthEnd';
    d.score = monthReport(d).score;
    (d.scores as number[]).push(d.score);
  }

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

/** Undo the last choice of this month. Null with no tokens or no snapshot. */
export function rewind(state: GameState): GameState | null {
  if (state.rewindTokens <= 0 || state.history.length === 0) return null;
  const history = state.history.slice(0, -1);
  const snapshot = state.history[state.history.length - 1] as Omit<GameState, 'history'>;
  return { ...snapshot, history, rewindTokens: state.rewindTokens - 1 };
}
