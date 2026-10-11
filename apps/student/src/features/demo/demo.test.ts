import { describe, expect, it } from 'vitest';
import { demoEntries, demoLife, demoNickname, demoOptions, demoProfile, withoutReset, DEMO_CLASS_CODE } from './seed';
import { NO_TAPS, TAP_WINDOW_MS, tap } from './tripleTap';

const ids = { anonId: 'a', classId: 'c', nickname: 'Demo0042' };

describe('demo seed (CLAUDE.md 9: ?demo=1)', () => {
  it('reads persona and language from the address, defaulting to Sana in English', () => {
    expect(demoOptions(new URLSearchParams('demo=1'))).toEqual({ persona: 'sana', lang: 'en' });
    expect(demoOptions(new URLSearchParams('demo=1&persona=ravi&lang=hi'))).toEqual({ persona: 'ravi', lang: 'hi' });
    expect(demoOptions(new URLSearchParams('persona=kiran&lang=ur'))).toEqual({ persona: 'sana', lang: 'en' });
  });

  it('offers Telugu only in draft-language builds', () => {
    expect(demoOptions(new URLSearchParams('lang=te')).lang).toBe('en');
    expect(demoOptions(new URLSearchParams('lang=te'), true).lang).toBe('te');
  });

  it('builds a joined profile in class HYD234', () => {
    const p = demoProfile({ persona: 'ravi', lang: 'hi' }, { ...ids, rejoinCode: 'ABC123' });
    expect(p).toMatchObject({ version: 1, persona: 'ravi', lang: 'hi', classCode: DEMO_CLASS_CODE, anonId: 'a', classId: 'c', rejoinCode: 'ABC123' });
    expect(demoProfile({ persona: 'sana', lang: 'en' }, ids)).not.toHaveProperty('rejoinCode');
  });

  it('starts mid-week with money and part-used meters', () => {
    const life = demoLife();
    expect(life.day).toBeGreaterThan(1);
    expect(life.money).toBeGreaterThan(0);
    expect(Number.isInteger(life.money)).toBe(true);
    expect(life.vitals.health).toBeLessThan(25);
    expect(life.vitals.sanity).toBeLessThan(25);
  });

  it('writes the profile and the stores as zustand persist envelopes, leaving Paisa Times unread', () => {
    const entries = new Map(demoEntries(demoProfile({ persona: 'sana', lang: 'en' }, ids)));
    expect(entries.get('paisa.profile')).toMatchObject({ nickname: 'Demo0042' });
    const game = JSON.parse(entries.get('paisa.game') as string);
    expect(game).toEqual({ state: { life: demoLife() }, version: 3 });
    expect(JSON.parse(entries.get('paisa.events') as string).state.steps).toBe(1);
    expect(entries.has('paisa.news')).toBe(false);
  });

  it('makes four-digit demo nicknames', () => {
    expect(demoNickname(42)).toBe('Demo0042');
    expect(demoNickname(123456.7)).toBe('Demo3456');
  });

  it('drops reset=1 so a reload keeps the demo', () => {
    expect(withoutReset('https://x.app/?demo=1&reset=1&lang=hi')).toBe('/?demo=1&lang=hi');
    expect(withoutReset('https://x.app/?reset=1')).toBe('/');
  });
});

describe('triple tap', () => {
  it('fires on the third quick tap and starts over', () => {
    let r = tap(NO_TAPS, 1000);
    r = tap(r.taps, 1200);
    expect(r.fire).toBe(false);
    r = tap(r.taps, 1400);
    expect(r.fire).toBe(true);
    expect(tap(r.taps, 1500).fire).toBe(false);
  });

  it('a slow tap restarts the count', () => {
    let r = tap(NO_TAPS, 0);
    r = tap(r.taps, 100);
    r = tap(r.taps, 100 + TAP_WINDOW_MS + 1);
    expect(r.fire).toBe(false);
    expect(r.taps.count).toBe(1);
  });
});
