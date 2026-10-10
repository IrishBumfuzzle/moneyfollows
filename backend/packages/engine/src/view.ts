import type { CardView, GameContent, GameState, Hud, View } from '@paisa/contracts';
import { EngineError } from './errors';
import { goalProgress } from './goal';
import { getCard } from './lookup';
import { canRewind } from './rewind';

function hud(state: GameState, content: GameContent): Hud {
  return {
    month: state.month,
    week: state.week,
    months: content.tuning.months,
    jars: state.jars,
    debt: state.debt,
    goal: { label: state.goal.label, amount: state.goal.amount, progress: goalProgress(state.jars.goals, state.goal.amount) },
    rewindTokens: state.rewindTokens,
    canRewind: canRewind(state),
    xp: state.xp,
    badges: state.badges,
    lastScore: state.scores.length > 0 ? (state.scores[state.scores.length - 1] as number) : null,
  };
}

function cardView(state: GameState, content: GameContent): CardView {
  if (!state.card) throw new EngineError('no_cards', 'game is in the card phase without a card');
  const card = getCard(content, state.card);
  const view: CardView = {
    kind: state.card.kind,
    id: card.id,
    pillar: card.pillar,
    text: card.text,
    assumption: ('assumption' in card ? card.assumption : undefined) ?? card.pillar === 'understand_investing',
    // Effects, lessons and ratings stay server-side: the student sees only what to tap.
    choices: card.choices.map((c) => ({ id: c.id, label: c.label, ...(c.icon !== undefined ? { icon: c.icon } : {}) })),
  };
  if (card.illustration !== undefined) view.illustration = card.illustration;
  return view;
}

/** What the client renders now. Pure: the API calls it for GET /games/:id. */
export function currentView(state: GameState, content: GameContent): View {
  const base = { hud: hud(state, content), notices: state.notices };
  switch (state.phase) {
    case 'card':
      return { kind: 'card', ...base, card: cardView(state, content) };
    case 'consequence':
      if (!state.lastOutcome) throw new EngineError('invalid_action', 'consequence phase without an outcome');
      return { kind: 'consequence', ...base, outcome: state.lastOutcome };
    case 'month_end':
      if (!state.report) throw new EngineError('invalid_action', 'month_end phase without a report');
      return { kind: 'month_end', ...base, report: state.report };
    case 'done': {
      const n = state.scores.length;
      return {
        kind: 'done',
        ...base,
        summary: {
          scores: state.scores,
          averageScore: n === 0 ? 0 : Math.round(state.scores.reduce((a, b) => a + b, 0) / n),
          goalReached: state.jars.goals >= state.goal.amount || state.milestones.includes(100),
          badges: state.badges,
          decisions: state.decisions.length,
        },
      };
    }
  }
}
