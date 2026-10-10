import { projectGrowth } from '@paisa/engine';
import { GROWTH_RATES } from '@paisa/shared';
import { describe, expect, it } from 'vitest';
import { CALLS, SCHEDULE } from '../events/data';
import { canChoose, resolveChoice } from '../events/resolve';
import { startLife } from '../life/life';
import { DEFAULT_FEED, normalizeFeed } from './api';
import { STRINGS } from './content';
import { createSnake, placeFood, step, tickMs, turn } from './snake';
import type { SnakeState } from './snake';
import { TIPS } from './tips';

describe('snake', () => {
  it('is deterministic: same seed, same food', () => {
    expect(createSnake(7)).toEqual(createSnake(7));
    expect(createSnake(7).food).not.toEqual(createSnake(8).food);
  });

  it('moves one cell per step and ignores reversing into itself', () => {
    const s = createSnake(1);
    const moved = step(s);
    expect(moved.body[0]).toEqual({ x: s.body[0].x + 1, y: s.body[0].y });
    expect(moved.body).toHaveLength(3);
    expect(turn(s, 'left')).toBe(s); // heading right: left would be a 180°
    expect(step(turn(s, 'up')).body[0]).toEqual({ x: s.body[0].x, y: s.body[0].y - 1 });
  });

  it('eats food, grows, scores, and places new food on a free cell', () => {
    const s0 = createSnake(3);
    const head = s0.body[0];
    const s: SnakeState = { ...s0, food: { x: head.x + 1, y: head.y } };
    const ate = step(s);
    expect(ate.score).toBe(1);
    expect(ate.body).toHaveLength(4);
    expect(ate.body.some((c) => c.x === ate.food.x && c.y === ate.food.y)).toBe(false);
  });

  it('dies on a wall or on itself, and a dead snake stays put', () => {
    let s = createSnake(1);
    for (let i = 0; i < 20 && s.alive; i++) s = step(s);
    expect(s.alive).toBe(false);
    expect(step(s)).toBe(s);
    const loop: SnakeState = {
      ...createSnake(1),
      body: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }],
      dir: 'up',
      next: 'down',
    };
    expect(step({ ...loop, next: 'down', dir: 'left' }).alive).toBe(false);
  });

  it('never mutates its input, and food is null only on a full board', () => {
    const s = Object.freeze(createSnake(2));
    expect(() => step(turn(s, 'down'))).not.toThrow();
    const full = Array.from({ length: 4 }, (_, i) => ({ x: i % 2, y: Math.floor(i / 2) }));
    expect(placeFood(2, full, 1, 0)).toBeNull();
    expect(tickMs(0)).toBeGreaterThan(tickMs(10));
    expect(tickMs(1000)).toBe(90);
  });
});

describe('Vanguard feed (class_status.vanguard → app)', () => {
  it('defaults to every bundled tip and the placeholder rates', () => {
    expect(normalizeFeed(undefined)).toEqual(DEFAULT_FEED);
    expect(DEFAULT_FEED.rates).toEqual(GROWTH_RATES);
  });

  it('keeps known tip ids in order, drops unknown and duplicates', () => {
    expect(normalizeFeed({ tips: ['tip.otp_never', 'nope', 'tip.needs_first', 'tip.otp_never'] }).tips).toEqual(['tip.otp_never', 'tip.needs_first']);
  });

  it('accepts sane rates only (0–30%, low ≤ avg ≤ high)', () => {
    expect(normalizeFeed({ growth_rates: { low: 0.03, avg: 0.06, high: 0.1 } }).rates).toEqual({ low: 0.03, avg: 0.06, high: 0.1 });
    for (const bad of [{ low: 0.1, avg: 0.05, high: 0.2 }, { low: -1, avg: 0.05, high: 0.2 }, { low: 0.04, avg: 0.08, high: 0.9 }, { low: '4%' }]) {
      expect(normalizeFeed({ growth_rates: bad }).rates).toEqual(GROWTH_RATES);
    }
  });

  it('the growth explorer always has a low, average and high range (CLAUDE.md 5.4)', () => {
    const p = projectGrowth(300, 10, DEFAULT_FEED.rates);
    expect(p.low[10]).toBeLessThan(p.avg[10]);
    expect(p.avg[10]).toBeLessThan(p.high[10]);
    expect(p.low[10]).toBeGreaterThan(300 * 120); // more than what was put in, at a positive rate
  });
});

describe('calls', () => {
  it('are scheduled, and a scam call has a safe choice and warning signs', () => {
    for (const c of CALLS) expect(SCHEDULE.map((s) => s.id)).toContain(c.id);
    const scam = CALLS.find((c) => c.verdict === 'scam')!;
    expect(scam.choices.some((c) => (c.effects.money ?? 0) === 0)).toBe(true);
    expect(scam.redFlags?.length).toBeGreaterThan(0);
  });

  it('a scam call takes what you have, never below zero', () => {
    const scam = CALLS.find((c) => c.verdict === 'scam')!;
    const tell = scam.choices.find((c) => (c.effects.money ?? 0) < 0)!;
    const broke = { ...startLife(), money: 50 };
    expect(canChoose(broke, tell)).toBe(true);
    expect(resolveChoice(broke, scam, tell.id)!.state.money).toBe(0);
  });
});

describe('phone strings', () => {
  it('en and hi have the same keys, including every tip', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const tip of TIPS) for (const part of ['title', 'body']) expect(STRINGS.en).toHaveProperty([`${tip.id}.${part}`]);
  });

  it('the Vanguard app educates and never recommends or promises (CLAUDE.md 7.2)', () => {
    for (const [k, v] of Object.entries(STRINGS.en!)) {
      expect(v, k).not.toMatch(/you should (invest|buy)|guarantee|risk-free|sure returns/i);
    }
    expect(STRINGS.en!['phone.vg.assumption']).toMatch(/not promises/);
  });
});
