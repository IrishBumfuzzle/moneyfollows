import { describe, expect, it } from 'vitest';
import { WORK } from '../life/config';
import { localLifeApi, startLife } from '../life/life';
import { STRINGS } from './content';
import {
  CUSTOMERS_PER_SHIFT,
  DRAWER,
  ITEMS,
  PAY_PER_CUSTOMER,
  changeDue,
  checkChange,
  checkUpi,
  dealShift,
  shiftWage,
} from './counter';
import type { CashCustomer, UpiCustomer } from './counter';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

describe('dealShift', () => {
  it('is deterministic: the same seed deals the same customers', () => {
    expect(dealShift(42)).toEqual(dealShift(42));
    expect(JSON.parse(JSON.stringify(dealShift(42)))).toEqual(dealShift(42));
  });

  it('deals different shifts for different seeds', () => {
    const shifts = new Set(SEEDS.map((s) => JSON.stringify(dealShift(s))));
    expect(shifts.size).toBeGreaterThan(150);
  });

  it('always deals 3 cash and 2 UPI customers: one real payment, one trick', () => {
    for (const seed of SEEDS) {
      const shift = dealShift(seed);
      expect(shift).toHaveLength(CUSTOMERS_PER_SHIFT);
      expect(shift.filter((c) => c.kind === 'cash')).toHaveLength(3);
      const upi = shift.filter((c): c is UpiCustomer => c.kind === 'upi');
      expect(upi.map((c) => c.upi === 'real').sort()).toEqual([false, true]);
      expect(new Set(shift.map((c) => c.who)).size).toBe(CUSTOMERS_PER_SHIFT);
    }
  });

  it('bills add up, cash covers the bill, and change can be made from the drawer', () => {
    for (const seed of SEEDS) {
      for (const c of dealShift(seed)) {
        expect(c.items.length).toBeGreaterThanOrEqual(1);
        expect(c.items.length).toBeLessThanOrEqual(3);
        expect(c.bill).toBe(c.items.reduce((s, it) => s + it.price, 0));
        if (c.kind === 'cash') {
          expect(c.paid).toBeGreaterThan(c.bill);
          expect(Number.isInteger(changeDue(c))).toBe(true);
          expect(DRAWER).toContain(1); // any whole-rupee change is reachable
        }
      }
    }
  });

  it('shows the full bill only for a real payment', () => {
    for (const seed of SEEDS) {
      for (const c of dealShift(seed)) {
        if (c.kind !== 'upi') continue;
        if (c.upi === 'real' || c.upi === 'collect_request') expect(c.shown).toBe(c.bill);
        if (c.upi === 'fake_screenshot') expect(c.shown).toBe(0);
        if (c.upi === 'wrong_amount') {
          expect(c.shown).toBeGreaterThan(0);
          expect(c.shown).toBeLessThan(c.bill);
        }
      }
    }
  });
});

describe('checkChange', () => {
  const c: CashCustomer = { kind: 'cash', who: 'aunty', items: [ITEMS[0]!, ITEMS[4]!], bill: 77, paid: 100 };

  it('accepts exactly the change due', () => {
    expect(changeDue(c)).toBe(23);
    expect(checkChange(c, 23)).toEqual({ ok: true, reason: 'change_right' });
  });

  it('says whether the change was short or over', () => {
    expect(checkChange(c, 20)).toEqual({ ok: false, reason: 'change_short' });
    expect(checkChange(c, 30)).toEqual({ ok: false, reason: 'change_over' });
  });
});

describe('checkUpi', () => {
  const upi = (u: UpiCustomer['upi']): UpiCustomer => ({ kind: 'upi', who: 'uncle', items: [], bill: 137, upi: u, shown: 137 });

  it('accepting is right only for a real payment', () => {
    expect(checkUpi(upi('real'), true)).toEqual({ ok: true, reason: 'upi_real' });
    expect(checkUpi(upi('real'), false)).toEqual({ ok: false, reason: 'upi_real_refused' });
  });

  it('refusing is right for every trick', () => {
    for (const u of ['fake_screenshot', 'collect_request', 'wrong_amount'] as const) {
      expect(checkUpi(upi(u), false)).toEqual({ ok: true, reason: `upi_${u}` });
      expect(checkUpi(upi(u), true)).toEqual({ ok: false, reason: `upi_${u}` });
    }
  });
});

describe('shiftWage and work()', () => {
  it('pays per customer served right; a perfect shift pays the full weekly wage', () => {
    const right = { ok: true, reason: 'change_right' } as const;
    const wrong = { ok: false, reason: 'change_short' } as const;
    expect(shiftWage([right, wrong, right])).toBe(2 * PAY_PER_CUSTOMER);
    expect(shiftWage(Array(CUSTOMERS_PER_SHIFT).fill(right))).toBe(WORK.wage);
    expect(shiftWage([])).toBe(0);
  });

  it('work() pays the shift wage once a week, capped at the weekly wage, never negative', () => {
    const life = startLife();
    const paid = localLifeApi.work(life, 120);
    expect(paid.delta.money).toBe(120);
    expect(paid.state.money).toBe(life.money + 120);
    expect(paid.delta.sanity).toBe(WORK.sanity);
    expect(localLifeApi.work(paid.state, 120).blocked).toBe('already_worked');
    expect(localLifeApi.work(life, 10_000).delta.money).toBe(WORK.wage);
    expect(localLifeApi.work(life, -50).delta.money).toBe(0);
    expect(localLifeApi.work(life).delta.money).toBe(WORK.wage);
    expect(life).toEqual(startLife()); // input untouched
  });
});

describe('store strings (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang]!)) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('has a name for every item and customer, and a line for every reason', () => {
    for (const it of ITEMS) expect(STRINGS.en![`store.item.${it.id}`]).toBeDefined();
    for (const c of dealShift(1)) expect(STRINGS.en![`counter.who.${c.who}`]).toBeDefined();
    const reasons = ['change_right', 'change_short', 'change_over', 'upi_real', 'upi_real_refused', 'upi_fake_screenshot', 'upi_collect_request', 'upi_wrong_amount'];
    for (const r of reasons) expect(STRINGS.en![`counter.why.${r}`]).toBeDefined();
  });

  it('keeps the same {{vars}} in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(STRINGS.en!)) expect(vars(STRINGS.hi![k]!), k).toEqual(vars(v));
  });
});
