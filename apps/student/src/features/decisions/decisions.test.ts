import { beforeEach, describe, expect, it } from 'vitest';
import { content } from '@paisa/content';
import { useGame } from '../../game/useGame';
import { OWN } from './content';
import { hasIcon } from './icons';
import { cardFor, choiceOfNote, planChoose, planPins, planRewind, planSleep, recapDue, startPlan } from './plan';
import type { GameState } from './plan';

/** Plays the first choice on every pin left this week. */
function playWeek(plan: GameState): GameState {
  let s = plan;
  for (const pin of planPins(s)) {
    const card = cardFor(s, pin.scenarioId)!;
    s = planChoose(s, pin.scenarioId, card.scenario.choices[0]!.id).state;
  }
  return s;
}

describe('decision strings (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys, no empty strings and the same {{vars}}', () => {
    expect(Object.keys(OWN.hi!).sort()).toEqual(Object.keys(OWN.en!).sort());
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(OWN.en!)) {
      expect(v.trim(), k).not.toBe('');
      expect(OWN.hi![k]!.trim(), k).not.toBe('');
      expect(vars(OWN.hi![k]!), k).toEqual(vars(v));
    }
  });
});

describe('the money plan on the engine', () => {
  it('the same seed gives the same pins and the same result', () => {
    const a = startPlan('sana', 42);
    const b = startPlan('sana', 42);
    expect(planPins(a)).toEqual(planPins(b));
    expect(planPins(a).length).toBeGreaterThanOrEqual(2);
    expect(playWeek(a)).toEqual(playWeek(b));
  });

  it('rewind restores the exact state before the choice and uses one token', () => {
    const before = startPlan('sana', 7);
    const pin = planPins(before)[0]!;
    const card = cardFor(before, pin.scenarioId)!;
    const after = planChoose(before, pin.scenarioId, card.scenario.choices[1]!.id).state;
    expect(planPins(after)).toHaveLength(planPins(before).length - 1);
    const back = planRewind(after)!;
    expect(back).toEqual({ ...before, rewindTokens: before.rewindTokens - 1 });
    expect(planRewind(before)).toBeNull(); // nothing to undo yet
  });

  it('the week cannot end while pins remain; it can once they are played', () => {
    const plan = startPlan('ravi', 3);
    const blocked = planSleep(plan);
    expect(blocked.kind).toBe('blocked');
    if (blocked.kind === 'blocked') expect(blocked.pins).toEqual(planPins(plan));
    const slept = planSleep(playWeek(plan));
    expect(slept.kind).toBe('slept');
    if (slept.kind === 'slept') expect(slept.result.state.week).toBe(2);
  });

  it('names the earlier choice behind a delayed effect', () => {
    const r = choiceOfNote('t:budget.recharge.01.b.later');
    expect(r?.scenarioId).toBe('budget.recharge.01');
    expect(r?.choice.id).toBe('b');
    expect(choiceOfNote('t:lesson.needs_first')).toBeNull();
  });

  it('every choice icon in the content pack is drawn', () => {
    const icons = new Set([...content.scenarios, ...content.events].flatMap((s) => s.choices.map((c) => c.icon)));
    for (const icon of icons) if (icon) expect(hasIcon(icon), icon).toBe(true);
  });
});

describe('store actions (useGame)', () => {
  beforeEach(() => useGame.setState({ plan: null, overnight: null }));

  it('ensurePlan creates the plan once, from the given seed', () => {
    useGame.getState().ensurePlan('sana', 11);
    const first = useGame.getState().plan;
    expect(first).toEqual(startPlan('sana', 11));
    useGame.getState().ensurePlan('sana', 99);
    expect(useGame.getState().plan).toBe(first);
  });

  it('choose then rewind gives back the exact plan', () => {
    useGame.getState().ensurePlan('sana', 5);
    const before = useGame.getState().plan!;
    const pin = planPins(before)[0]!;
    const card = cardFor(before, pin.scenarioId)!;
    const c = useGame.getState().choosePlan(pin.scenarioId, card.scenario.choices[0]!.id);
    expect(c?.scenarioId).toBe(pin.scenarioId);
    expect(useGame.getState().choosePlan(pin.scenarioId, card.scenario.choices[0]!.id)).toBeNull(); // already played
    expect(useGame.getState().rewindPlan()).toBe(true);
    expect(useGame.getState().plan).toEqual({ ...before, rewindTokens: before.rewindTokens - 1 });
  });

  it("the day-7 sleep is blocked while pins remain and leaves the plan as it was", () => {
    useGame.getState().ensurePlan('sana', 8);
    const before = useGame.getState().plan;
    expect(useGame.getState().sleepPlan()?.kind).toBe('blocked');
    expect(useGame.getState().plan).toBe(before);
  });

  it('four weeks reach the Month Recap; continuing starts month 2 with payday', () => {
    useGame.getState().ensurePlan('sana', 21);
    for (let w = 0; w < 4; w++) {
      useGame.setState({ plan: playWeek(useGame.getState().plan!) });
      expect(useGame.getState().sleepPlan()?.kind).toBe('slept');
    }
    expect(recapDue(useGame.getState().plan)).toBe(true);
    useGame.getState().continueMonth();
    const { plan, overnight } = useGame.getState();
    expect(plan?.month).toBe(2);
    expect(plan?.week).toBe(1);
    expect(overnight?.payday?.income).toBe(4000);
  });
});

describe('demo hooks (hidden demo panel)', () => {
  beforeEach(() => useGame.setState({ plan: null, overnight: null }));

  it('openRecap ends weeks until the Month Recap; fireFlashback shows one', async () => {
    const { endWeekNow, fireFlashback, openRecap } = await import('./demo');
    useGame.getState().ensurePlan('ravi', 4);
    endWeekNow();
    expect(useGame.getState().plan?.week).toBe(2);
    openRecap();
    expect(recapDue(useGame.getState().plan)).toBe(true);
    useGame.setState({ overnight: null });
    fireFlashback();
    expect(useGame.getState().overnight?.landed).toHaveLength(1);
  });
});

describe('Shop sub-map', () => {
  it('lists the three spots from places.json', async () => {
    const { subPlaces } = await import('./plan');
    expect(subPlaces('convenience')).toEqual(['convenience.phone_shop', 'convenience.kirana', 'convenience.clothes_stall']);
    expect(subPlaces('school')).toEqual([]);
  });

  it('a pin with a sublocation plays at its spot, not on the Shop itself', async () => {
    const { cardAt } = await import('./plan');
    // Seed 42 pins Sana's phone shop in week 1.
    const plan = startPlan('sana', 42);
    const pin = planPins(plan).find((p) => p.sublocation)!;
    expect(pin.sublocation).toBe('convenience.phone_shop');
    expect(cardAt(plan, 'convenience', pin.sublocation)?.scenario.id).toBe(pin.scenarioId);
    expect(cardAt(plan, 'convenience', 'convenience.kirana')).toBeNull();
    const own = planPins(plan).find((p) => p.location === 'convenience' && !p.sublocation);
    expect(cardAt(plan, 'convenience')?.scenario.id ?? null).toBe(own?.scenarioId ?? null);
  });
});
