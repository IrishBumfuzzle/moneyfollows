import type { ContentBundle, GameState } from '@paisa/shared';
import { content as bundledContent } from '@paisa/content';
import { choose, createGame, nextCard } from './game';

export const DEMO_SEED = 2026;

/**
 * The seeded save behind `?demo=1` (CLAUDE.md 9): Sana, explorer level, played to
 * month 2 week 2 by a fixed script, so the demo never depends on luck or a long
 * play-through. It picks the risky choice once early on, so a delayed
 * consequence is still pending when the demo starts.
 */
export function createDemoGame(content: ContentBundle = bundledContent): GameState {
  let state = createGame('sana', 'explorer', DEMO_SEED, content);
  let decisions = 0;
  while (!(state.month === 2 && state.week === 2 && state.stage !== 'event')) {
    const card = nextCard(state, content);
    let choiceId: string;
    if (card.kind === 'monthEnd') choiceId = 'continue';
    else if (card.kind === 'yearEnd') break;
    else {
      const choices = card.scenario.choices;
      const wantRisky = card.kind === 'decision' && decisions === 1;
      const pick = choices.find((c) => c.rating === (wantRisky ? 'risky' : 'best')) ?? choices[0]!;
      choiceId = pick.id;
      if (card.kind === 'decision') decisions += 1;
    }
    state = choose(state, content, choiceId).state;
  }
  return state;
}
