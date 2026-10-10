import {
  Action,
  NewGameInput,
  type GameContent,
  type GameState,
  type Notice,
  type StepResult,
} from '@paisa/contracts';
import { absWeek } from './clock';
import { drawEvent } from './events';
import { firePending, resolveChoice, spend } from './effects';
import { EngineError } from './errors';
import { checkMilestones } from './goal';
import { rollIncome, splitIncome } from './income';
import { emit, newOut, type Out } from './internal';
import { monthReport } from './lesson';
import { getCard, getPersona } from './lookup';
import { restoreSnapshot, takeSnapshot, canRewind } from './rewind';
import { checkBadges } from './rewards';
import { nextFloat, seedRng } from './rng';
import { pickScenario } from './selector';
import { currentView } from './view';

/** Start of a month: pay in by the jar split, take fixed costs, refill rewind tokens. */
function payday(state: GameState, content: GameContent, out: Out): GameState {
  const persona = getPersona(content, state.personaId);
  const [income, rng] = rollIncome(persona, state.month, state.rng);
  let s: GameState = { ...state, rng };

  const shares = splitIncome(income, s.split);
  const paid = spend(s, shares, 0, out);
  s = paid.state;
  out.notices.push({ kind: 'payday', amount: income, deltas: paid.applied.deltas });

  if (persona.fixedCosts > 0) {
    const costs = spend(s, { needs: -persona.fixedCosts }, 0, out);
    s = costs.state;
    const notice: Notice = { kind: 'fixed_costs', amount: persona.fixedCosts, deltas: costs.applied.deltas };
    if (costs.applied.borrowed > 0) notice.debt = costs.applied.debt;
    out.notices.push(notice);
  }

  return {
    ...s,
    monthStart: { jars: s.jars, debt: s.debt, income },
    rewindTokens: content.tuning.rewindTokensPerMonth,
    snapshot: null,
  };
}

/** Start of a week: land due delayed effects, then deal the week's first card (an event or the decision). */
function startWeek(state: GameState, content: GameContent, out: Out): GameState {
  const now = absWeek(state.month, state.week, content.tuning);
  let s = firePending(state, now, out);

  // Always draw the float, even when the deck turns out empty, so rng use is the same either way.
  const [roll, afterRoll] = nextFloat(s.rng);
  s = { ...s, rng: afterRoll };
  const chance = content.tuning.eventChance[String(s.level) as '1' | '2' | '3'];
  if (roll < chance) {
    const [event, rng] = drawEvent(s, content, s.rng);
    if (event) return { ...s, rng, phase: 'card', card: { kind: 'event', id: event.id }, decided: false };
  }
  const [scenario, rng] = pickScenario(s, content, s.rng);
  return { ...s, rng, phase: 'card', card: { kind: 'decision', id: scenario.id }, decided: false };
}

function choose(state: GameState, choiceId: string, content: GameContent, out: Out): GameState {
  if (state.phase === 'done') throw new EngineError('game_over', 'the year is over');
  if (state.phase !== 'card' || !state.card) throw new EngineError('invalid_action', `cannot choose in phase "${state.phase}"`);
  const card = getCard(content, state.card);
  const choice = card.choices.find((c) => c.id === choiceId);
  if (!choice) throw new EngineError('unknown_choice', `"${choiceId}" is not a choice on ${card.id}`);

  const snapshot = takeSnapshot(state);
  const now = absWeek(state.month, state.week, content.tuning);
  const resolved = resolveChoice(state, choice.effects, card.id, now, content.tuning, out);
  const kind = state.card.kind;
  const concept = 'concept' in card ? card.concept : 'event';

  const flags = [...state.flags];
  for (const f of choice.effects.flags ?? []) if (!flags.includes(f)) flags.push(f);

  const xpGain = content.tuning.xp.decision + (choice.rating === 'best' ? content.tuning.xp.bestChoice : 0);
  let s: GameState = {
    ...resolved.state,
    snapshot,
    flags,
    pending: [...state.pending, ...resolved.queued],
    seen: [...state.seen, card.id],
    decisions: [
      ...state.decisions,
      {
        month: state.month,
        week: state.week,
        cardId: card.id,
        cardKind: kind,
        pillar: card.pillar,
        concept,
        choiceId: choice.id,
        ...(choice.rating !== undefined ? { rating: choice.rating } : {}),
      },
    ],
    xp: state.xp + xpGain,
    lessons: state.lessons.includes(choice.lesson) ? state.lessons : [...state.lessons, choice.lesson],
    lastOutcome: {
      cardId: card.id,
      cardKind: kind,
      choiceId: choice.id,
      applied: resolved.applied,
      lesson: choice.lesson,
      queued: resolved.queued.length,
    },
    decided: state.decided || kind === 'decision',
    phase: 'consequence',
  };
  s = checkMilestones(s, out);
  s = checkBadges(s, content, out, null);

  emit(out, 'decision_made', {
    scenarioId: card.id,
    choiceId: choice.id,
    pillar: card.pillar,
    cardKind: kind,
    month: state.month,
    week: state.week,
    ...(choice.rating !== undefined ? { rating: choice.rating } : {}),
  });
  if (kind === 'event') emit(out, 'event_triggered', { eventId: card.id });
  return s;
}

function rewind(state: GameState, out: Out): GameState {
  if (!canRewind(state)) throw new EngineError('no_rewind', 'nothing to rewind, or no rewind tokens left');
  const undone = state.lastOutcome;
  emit(out, 'rewind_used', { scenarioId: undone?.cardId ?? '', choiceId: undone?.choiceId ?? '' });
  return restoreSnapshot(state);
}

function advance(state: GameState, action: Extract<Action, { type: 'advance' }>, content: GameContent, out: Out): GameState {
  const { tuning } = content;
  switch (state.phase) {
    case 'consequence': {
      // Once the player moves on, the choice can't be undone.
      const s: GameState = { ...state, snapshot: null };
      if (!s.decided) {
        const [scenario, rng] = pickScenario(s, content, s.rng);
        return { ...s, rng, phase: 'card', card: { kind: 'decision', id: scenario.id } };
      }
      if (s.week < tuning.weeksPerMonth) return startWeek({ ...s, week: s.week + 1 }, content, out);

      const report = monthReport(s, content);
      let e: GameState = {
        ...s,
        phase: 'month_end',
        card: null,
        report,
        scores: [...s.scores, report.score],
        xp: s.xp + tuning.xp.monthComplete,
      };
      e = checkMilestones(e, out);
      return checkBadges(e, content, out, report.score);
    }
    case 'month_end': {
      let s = state;
      if (action.reflection !== undefined) {
        if (!s.report || action.reflection >= s.report.reflection.options.length) {
          throw new EngineError('invalid_action', 'reflection answer is not one of the options');
        }
        s = { ...s, xp: s.xp + tuning.xp.reflection };
      }
      if (action.split) s = { ...s, split: action.split };
      if (s.month >= tuning.months) return { ...s, phase: 'done', card: null, report: null };
      s = payday({ ...s, month: s.month + 1, week: 1, report: null, card: null }, content, out);
      return startWeek(s, content, out);
    }
    case 'card':
    case 'done':
      throw new EngineError('invalid_action', `cannot advance in phase "${state.phase}"`);
  }
}

function finish(state: GameState, out: Out, content: GameContent): StepResult {
  const next: GameState = { ...state, notices: out.notices };
  return { state: next, view: currentView(next, content), events: out.events };
}

/** Begins a game: first payday, then the first card. */
export function newGame(input: NewGameInput, content: GameContent): StepResult {
  const parsed = NewGameInput.safeParse(input);
  if (!parsed.success) throw new EngineError('invalid_action', parsed.error.message);
  const { personaId, level, seed } = parsed.data;
  const persona = getPersona(content, personaId);
  const out = newOut();
  emit(out, 'persona_selected', { personaId, level });

  const initial: GameState = {
    version: 1,
    personaId,
    level,
    seed,
    rng: seedRng(seed),
    month: 1,
    week: 1,
    phase: 'card',
    card: null,
    decided: false,
    jars: { ...persona.startingJars },
    debt: 0,
    split: { ...persona.split },
    goal: { ...persona.goal },
    flags: [],
    seen: [],
    pending: [],
    rewindTokens: content.tuning.rewindTokensPerMonth,
    monthStart: { jars: { ...persona.startingJars }, debt: 0, income: 0 },
    decisions: [],
    lastOutcome: null,
    notices: [],
    report: null,
    scores: [],
    milestones: [],
    xp: 0,
    badges: [],
    lessons: [],
    snapshot: null,
  };
  return finish(startWeek(payday(initial, content, out), content, out), out, content);
}

/** One player action. Never mutates `state`; throws `EngineError` for an action that isn't allowed now. */
export function step(state: GameState, action: Action, content: GameContent): StepResult {
  const parsed = Action.safeParse(action);
  if (!parsed.success) throw new EngineError('invalid_action', parsed.error.message);
  const a = parsed.data;
  const out = newOut();
  switch (a.type) {
    case 'choose':
      return finish(choose(state, a.choiceId, content, out), out, content);
    case 'rewind':
      return finish(rewind(state, out), out, content);
    case 'advance':
      return finish(advance(state, a, content, out), out, content);
  }
}
