import { describe, expect, it } from 'vitest';
import { GameState, StepResult, type Action } from '@paisa/contracts';
import { step } from '../../src';
import { content } from '../fixtures';
import { start } from '../helpers';

// Any change to this transcript must be deliberate: update the snapshot in the same PR
// (`npx vitest run packages/engine -u`) and say why in the PR description.
describe('golden: sana, level 2, seed 42, always the first choice', () => {
  function play() {
    let r = start(content, 'sana', 2, 42);
    const transcript: { month: number; week: number; cardId: string; choiceId: string; jars: GameState['jars']; debt: number }[] = [];
    let steps = 0;
    while (r.view.kind !== 'done') {
      expect(++steps).toBeLessThan(1000);
      const before = r.state;
      let action: Action;
      if (r.view.kind === 'card') action = { type: 'choose', choiceId: r.view.card.choices[0]!.id };
      else if (r.view.kind === 'month_end') action = { type: 'advance', reflection: 0 };
      else action = { type: 'advance' };
      r = step(before, action, content);
      expect(GameState.safeParse(r.state).success).toBe(true);
      expect(StepResult.safeParse(r).success).toBe(true);
      if (action.type === 'choose') {
        transcript.push({ month: before.month, week: before.week, cardId: before.card!.id, choiceId: action.choiceId, jars: r.state.jars, debt: r.state.debt });
      }
    }
    return { final: r.state, transcript };
  }

  it('plays a full year to done and every state matches the schema', () => {
    const { final } = play();
    expect(final.phase).toBe('done');
    expect(final.scores.length).toBe(12);
    expect(final.card).toBeNull();
  });

  it('matches the recorded transcript', () => {
    const { final, transcript } = play();
    expect({
      transcript,
      scores: final.scores,
      xp: final.xp,
      badges: final.badges,
      milestones: final.milestones,
      debt: final.debt,
      jars: final.jars,
      lessons: final.lessons,
    }).toMatchSnapshot();
  });

  it('is repeatable', () => {
    expect(play()).toEqual(play());
  });
});
