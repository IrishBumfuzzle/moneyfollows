import { describe, expect, it } from 'vitest';
import { startLife } from '../life/life';
import { STRINGS } from './content';
import { EVENTS, INJURY, SCHEDULE, THREADS, getEvent } from './data';
import { canChoose, dueIds, resolveChoice } from './resolve';

const life = { ...startLife(), money: 1000 };

describe('injury (sudden event)', () => {
  it('hurts health, then paying costs money and heals', () => {
    const pay = resolveChoice(life, INJURY, 'pay')!;
    expect(pay.state.money).toBe(400);
    expect(pay.delta.health).toBeGreaterThan(0);
  });

  it("paying is blocked when the wallet can't cover the bill; borrowing still works and adds debt", () => {
    const poor = { ...life, money: 100 };
    const pay = INJURY.choices.find((c) => c.id === 'pay')!;
    expect(canChoose(poor, pay)).toBe(false);
    expect(resolveChoice(poor, INJURY, 'pay')!.blocked).toBe('not_enough_money');
    const borrow = resolveChoice(poor, INJURY, 'borrow')!;
    expect(borrow.state).toMatchObject({ money: 100, debt: 600 });
  });

  it('resting costs nothing but sanity', () => {
    const rest = resolveChoice(life, INJURY, 'rest')!;
    expect(rest.state.money).toBe(1000);
    expect(rest.delta.sanity).toBeLessThan(0);
  });
});

describe('phone threads', () => {
  it('a scam takes what you have, never more, and can always be chosen', () => {
    const kyc = getEvent('phone.kyc.01')!;
    const broke = { ...life, money: 120 };
    const out = resolveChoice(broke, kyc, 'tap')!;
    expect(out.blocked).toBeUndefined();
    expect(out.state.money).toBe(0);
    expect(out.delta.money).toBe(-120);
  });

  it('every scam has a safe choice that loses no money, and red flags to show', () => {
    for (const th of THREADS.filter((x) => x.verdict === 'scam')) {
      expect(th.choices.some((c) => (c.effects.money ?? 0) === 0), th.id).toBe(true);
      expect(th.redFlags?.length, th.id).toBeGreaterThan(0);
    }
  });

  it('real offers pay earned income (never free money): money up comes with effort, sanity down', () => {
    for (const th of THREADS.filter((x) => x.verdict === 'legit')) {
      for (const c of th.choices) {
        if ((c.effects.money ?? 0) > 0) expect(c.effects.sanity ?? 0, `${th.id}.${c.id}`).toBeLessThan(0);
      }
    }
  });

  it('unknown choices resolve to null', () => {
    expect(resolveChoice(life, INJURY, 'nope')).toBeNull();
  });
});

describe('schedule', () => {
  it('delivers due events once, in order', () => {
    expect(dueIds(1, [])).toEqual([]);
    expect(dueIds(2, [])).toEqual(['phone.kyc.01']);
    expect(dueIds(5, ['phone.kyc.01'])).toEqual(['call.ammi_groceries.01', 'phone.tuition.01', INJURY.id]);
    expect(dueIds(99, SCHEDULE.map((s) => s.id))).toEqual([]);
  });

  it('only schedules events that exist, each once', () => {
    const ids = SCHEDULE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getEvent(id), id).toBeDefined();
  });
});

describe('content (CLAUDE.md 7.2)', () => {
  const keysOf = () =>
    EVENTS.flatMap((e) => [
      ...(e.kind === 'sudden'
        ? [e.title, e.story, e.billTitle, e.bill]
        : e.kind === 'call'
          ? [e.caller, ...e.lines, ...(e.redFlags ?? [])]
          : [e.sender, ...e.messages, ...(e.redFlags ?? [])]),
      ...e.choices.flatMap((c) => [c.label, c.outcome, c.lesson, ...(c.reply ? [c.reply] : [])]),
    ]);

  it('every key exists in en and hi, and both files have the same keys', () => {
    for (const k of keysOf()) {
      expect(STRINGS.en, k).toHaveProperty([k.slice(2)]);
      expect(STRINGS.hi, k).toHaveProperty([k.slice(2)]);
    }
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
  });

  it('labels ≤ 40 and lessons ≤ 140 characters; 2–4 choices each', () => {
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      expect(e.choices.length).toBeLessThanOrEqual(4);
      for (const c of e.choices) {
        for (const l of ['en', 'hi'] as const) {
          expect(STRINGS[l]![c.label.slice(2)].length, c.label).toBeLessThanOrEqual(40);
          expect(STRINGS[l]![c.lesson.slice(2)].length, c.lesson).toBeLessThanOrEqual(140);
        }
      }
    }
  });

  it('no guarantee words outside scam messages, and only the allowed outbound link', () => {
    const scamText = new Set(THREADS.filter((t) => t.verdict === 'scam').flatMap((t) => t.messages.map((m) => m.slice(2))));
    for (const [k, v] of Object.entries(STRINGS.en!)) {
      if (!scamText.has(k)) expect(v, k).not.toMatch(/guarantee|risk-free|sure returns|100% safe/i);
      const links = v.match(/\b[\w-]+\.(gov\.in|com|in|org)\b/g) ?? [];
      for (const link of links) expect(link, k).toBe('cybercrime.gov.in');
    }
  });
});
