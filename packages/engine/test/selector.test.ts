import { describe, expect, it } from 'vitest';
import { BASICS_BEFORE_INVESTING, RECENT_DECISIONS, RECENT_EVENTS, UNSEEN_WEIGHT } from '@paisa/shared';
import type { GameState, Level, PersonaId } from '@paisa/shared';
import { EngineError, createGame, nextCard } from '../src';
import { bundle, event, fixture, scenario, withState } from './fixtures';

const noEvents = bundle({ events: [] });

function firstCards(persona: PersonaId, level: Level, patch: Partial<GameState> = {}): Set<string> {
  const ids = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const s = withState(createGame(persona, level, seed, noEvents), patch);
    const card = nextCard(s, noEvents);
    if (card.kind === 'decision') ids.add(card.scenario.id);
  }
  return ids;
}

describe('decision selector', () => {
  it('starter sees only difficulty 1, no investing, no flag-gated cards', () => {
    const ids = firstCards('sana', 'starter');
    expect([...ids].sort()).toEqual(['budget.a', 'flag.set', 'save.a', 'save.delayed']);
  });

  it('filters by persona', () => {
    expect(firstCards('sana', 'explorer').has('budget.ravi_only')).toBe(false);
    expect(firstCards('ravi', 'explorer').has('budget.sana_only')).toBe(false);
    expect(firstCards('ravi', 'starter').has('budget.ravi_only')).toBe(true);
  });

  it('filters difficulty by level', () => {
    expect(firstCards('sana', 'explorer').has('safe.hard')).toBe(false);
    expect(firstCards('sana', 'explorer').has('budget.sana_only')).toBe(true);
    expect(firstCards('sana', 'planner').has('safe.hard')).toBe(true);
  });

  it('opens flag-gated cards only once the flag is set', () => {
    expect(firstCards('sana', 'starter').has('flag.req')).toBe(false);
    expect(firstCards('sana', 'starter', { flags: ['borrowed_friend'] }).has('flag.req')).toBe(true);
  });

  it('unlocks investing for starters after two basics decisions', () => {
    expect(firstCards('sana', 'starter', { seen: ['budget.a'] }).has('invest.a')).toBe(false);
    expect(firstCards('sana', 'starter', { seen: ['budget.a', 'save.a'] }).has('invest.a')).toBe(true);
    expect(firstCards('sana', 'explorer').has('invest.a')).toBe(true);
  });

  it('avoids the three most recent cards when others exist', () => {
    const recent = ['budget.a', 'save.a', 'save.delayed'];
    const ids = firstCards('sana', 'starter', { seen: recent });
    // the three recent are all basics, which also unlocks investing for the starter
    expect([...ids].sort()).toEqual(['flag.set', 'invest.a']);
  });

  it('never drops the difficulty or investing gates: nothing eligible is a clear no_cards error', () => {
    const hardOnly = bundle({
      events: [],
      scenarios: fixture.scenarios.filter((s) => s.id === 'safe.hard' || s.id === 'flag.req' || s.id === 'invest.a'),
    });
    const s = createGame('sana', 'starter', 1, hardOnly);
    try {
      nextCard(s, hardOnly);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      expect((e as EngineError).code).toBe('no_cards');
      expect((e as EngineError).message).toMatch(/gates/);
    }
    // the same content is fine for a planner, who passes the difficulty gate
    expect(nextCard(createGame('sana', 'planner', 1, hardOnly), hardOnly).kind).toBe('decision');
  });

  it('relaxes recency first, keeping the gates', () => {
    const c = bundle({ events: [], scenarios: [scenario('easy'), scenario('hard', { difficulty: 3 })] });
    for (let seed = 0; seed < 50; seed++) {
      const s = withState(createGame('sana', 'starter', seed, c), { seen: ['easy'] });
      const card = nextCard(s, c);
      expect(card.kind === 'decision' && card.scenario.id).toBe('easy');
    }
  });

  it('events do not shrink the decision recency window', () => {
    // three events after budget.a: budget.a is still one of the last RECENT_DECISIONS decisions
    const seen = ['budget.a', 'event.rain', 'event.ok', 'event.rain'];
    for (let seed = 0; seed < 200; seed++) {
      const s = withState(createGame('sana', 'starter', seed, fixture), { seen, stage: 'decision' });
      const card = nextCard(s, fixture);
      expect(card.kind === 'decision' && card.scenario.id).not.toBe('budget.a');
    }
  });

  it('decisions do not shrink the event recency window', () => {
    const c = bundle({ events: [event('event.rain'), event('event.sun')] });
    const seen = ['event.rain', 'budget.a', 'save.a', 'save.delayed', 'flag.set', 'budget.sana_only', 'invest.a'];
    for (let seed = 0; seed < 50; seed++) {
      const s = withState(createGame('sana', 'explorer', seed, c), { seen, stage: 'event' });
      const card = nextCard(s, c);
      expect(card.kind === 'event' && card.scenario.id).toBe('event.sun');
    }
  });

  it('selector tuning lives in the shared constants', () => {
    expect({ RECENT_EVENTS, RECENT_DECISIONS, UNSEEN_WEIGHT, BASICS_BEFORE_INVESTING }).toEqual({
      RECENT_EVENTS: 6,
      RECENT_DECISIONS: 3,
      UNSEEN_WEIGHT: 5,
      BASICS_BEFORE_INVESTING: 2,
    });
  });

  it('weights unseen cards above seen ones', () => {
    let seenPicks = 0;
    for (let seed = 0; seed < 600; seed++) {
      const s = withState(createGame('sana', 'starter', seed, noEvents), { seen: ['flag.set', 'x', 'y', 'z'] });
      const card = nextCard(s, noEvents);
      if (card.kind === 'decision' && card.scenario.id === 'flag.set') seenPicks++;
    }
    // pool: budget.a, save.a, save.delayed (unseen, weight 5) and flag.set (seen, weight 1): ~6.7%
    expect(seenPicks / 600).toBeLessThan(0.15);
    expect(seenPicks).toBeGreaterThan(0);
  });
});
