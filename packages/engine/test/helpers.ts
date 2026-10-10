import type { Card, ContentBundle, GameState, Level, PersonaId } from '@paisa/shared';
import { CONTINUE } from '@paisa/shared';
import { choose, createGame, nextCard } from '../src';

export type Pick = (card: Card) => string;

export const first: Pick = (card) => {
  if (card.kind === 'monthEnd') return CONTINUE;
  if (card.kind === 'yearEnd') throw new Error('year over');
  return card.scenario.choices[0]!.id;
};

/** Plays until the predicate holds or the game ends. Returns the final state and a transcript. */
export function play(
  state: GameState,
  content: ContentBundle,
  pick: Pick = first,
  until: (s: GameState) => boolean = () => false,
): { state: GameState; log: string[] } {
  const log: string[] = [];
  let s = state;
  for (let i = 0; i < 500 && !until(s); i++) {
    const card = nextCard(s, content);
    if (card.kind === 'yearEnd') return { state: s, log };
    const id = pick(card);
    const r = choose(s, content, id);
    const name = card.kind === 'monthEnd' ? 'monthEnd' : card.scenario.id;
    log.push(`m${s.month}w${s.week} ${card.kind} ${name} -> ${id}`);
    s = r.state;
  }
  return { state: s, log };
}

export function playGame(content: ContentBundle, persona: PersonaId, level: Level, seed: number, pick: Pick = first) {
  return play(createGame(persona, level, seed, content), content, pick);
}

export const at =
  (month: number, week: number) =>
  (s: GameState): boolean =>
    s.month === month && s.week === week && s.stage !== 'monthEnd';

/** Always picks this choice id on cards, and CONTINUE at month end. */
export const always =
  (id: string): Pick =>
  (card) =>
    card.kind === 'monthEnd' ? CONTINUE : id;
