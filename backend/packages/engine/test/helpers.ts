import { GameState, StepResult, type Action, type GameContent, type View } from '@paisa/contracts';
import { newGame, step } from '../src';

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function start(c: GameContent, personaId: 'ravi' | 'sana' | 'kiran' | 'lakshmi' = 'sana', level = 2, seed = 42): StepResult {
  return newGame({ personaId, level, seed }, c);
}

/** The same state with the card on screen replaced, so a test can set up an exact situation. */
export function withCard(state: GameState, kind: 'decision' | 'event', id: string): GameState {
  return { ...state, phase: 'card', card: { kind, id }, decided: false };
}

export type Policy = (view: Extract<View, { kind: 'card' }>, state: GameState) => string;
export const firstChoice: Policy = (v) => (v.card.choices[0] as { id: string }).id;

export interface Played {
  state: GameState;
  /** Every action taken, in order. */
  actions: Action[];
  /** After each choose: the card, the choice and the money. */
  transcript: { month: number; week: number; cardId: string; choiceId: string; jars: GameState['jars']; debt: number }[];
}

/**
 * Plays to the end of the year (or until `stop` says so) with a policy for card
 * choices, advancing every other screen with reflection 0. Each step's result is
 * schema-checked.
 */
export function autoplay(
  c: GameContent,
  from: StepResult,
  policy: Policy = firstChoice,
  stop: (r: StepResult) => boolean = () => false,
  opts: { freeze?: boolean } = {},
): Played {
  let r = from;
  const played: Played = { state: r.state, actions: [], transcript: [] };
  for (let i = 0; i < 5000 && r.view.kind !== 'done' && !stop(r); i++) {
    let action: Action;
    if (r.view.kind === 'card') action = { type: 'choose', choiceId: policy(r.view, r.state) };
    else if (r.view.kind === 'month_end') action = { type: 'advance', reflection: 0 };
    else action = { type: 'advance' };
    const before = r.state;
    if (opts.freeze) deepFreeze(action);
    r = step(opts.freeze ? deepFreeze(before) : before, action, c);
    GameState.parse(r.state);
    StepResult.parse(r);
    played.actions.push(action);
    if (action.type === 'choose') {
      played.transcript.push({
        month: before.month,
        week: before.week,
        cardId: before.card?.id ?? '',
        choiceId: action.choiceId,
        jars: r.state.jars,
        debt: r.state.debt,
      });
    }
  }
  played.state = r.state;
  return played;
}
