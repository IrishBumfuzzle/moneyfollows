import { describe, expect, it } from 'vitest';
import type { Level, PersonaId } from '@paisa/shared';
import { createGame, nextCard } from '../src';
import { bundle, fixture } from './fixtures';

const noEvents = bundle({ events: [] });

function firstCards(persona: PersonaId, level: Level, patch: object = {}): Set<string> {
  const ids = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const s = { ...createGame(persona, level, seed, noEvents), ...patch };
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

  it('relaxes difficulty and the lock when nothing else is eligible, but keeps flag gates', () => {
    const hardOnly = bundle({
      events: [],
      scenarios: fixture.scenarios.filter((s) => s.id === 'safe.hard' || s.id === 'flag.req'),
    });
    const card = nextCard(createGame('sana', 'starter', 1, hardOnly), hardOnly);
    expect(card.kind === 'decision' && card.scenario.id).toBe('safe.hard');
  });

  it('weights unseen cards above seen ones', () => {
    let seenPicks = 0;
    for (let seed = 0; seed < 600; seed++) {
      const s = { ...createGame('sana', 'starter', seed, noEvents), seen: ['flag.set', 'x', 'y', 'z'] };
      const card = nextCard(s, noEvents);
      if (card.kind === 'decision' && card.scenario.id === 'flag.set') seenPicks++;
    }
    // pool: budget.a, save.a, save.delayed (unseen, weight 5) and flag.set (seen, weight 1): ~6.7%
    expect(seenPicks / 600).toBeLessThan(0.15);
    expect(seenPicks).toBeGreaterThan(0);
  });
});
