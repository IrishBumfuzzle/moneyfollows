import { describe, expect, it } from 'vitest';
import { content } from '@paisa/content';
import { createDemoGame, nextCard } from '../src';

describe('createDemoGame', () => {
  it('always gives the same mid-game save at month 2 week 2', () => {
    const a = createDemoGame(content);
    expect(createDemoGame(content)).toEqual(a);
    expect([a.month, a.week]).toEqual([2, 2]);
    expect(a.personaId).toBe('sana');
    expect(a.scores?.length).toBe(1);
    expect(['decision', 'event']).toContain(nextCard(a, content).kind);
  });
});
