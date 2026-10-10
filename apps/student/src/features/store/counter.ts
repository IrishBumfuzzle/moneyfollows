// Counter Shift: the convenience store's work mini-game. The player runs the kirana counter for
// five customers: cash customers need the right change, UPI customers need the shop's own phone
// checked (a fake screenshot, a collect request or a short payment is not money received).
// Pure like the engine: no clock, no Math.random, never mutates its input; the same seed
// always deals the same customers, so a shift can be replayed and tested.
import { WORK } from '../life/config';
import { hash, shuffle } from './seed';

export type ItemId = 'rice' | 'dal' | 'soap' | 'milk' | 'biscuits' | 'eggs' | 'oil' | 'tea' | 'bread';
export type CustomerId = 'aunty' | 'uncle' | 'student' | 'driver' | 'dadi';

/** What the shop's own phone shows. Only `received` with the full bill is money in hand. */
export type UpiCase = 'real' | 'fake_screenshot' | 'collect_request' | 'wrong_amount';

export interface Item {
  id: ItemId;
  price: number; // whole rupees
}

interface CustomerBase {
  who: CustomerId;
  items: Item[];
  bill: number;
}
export interface CashCustomer extends CustomerBase {
  kind: 'cash';
  paid: number; // the note handed over; always more than the bill
}
export interface UpiCustomer extends CustomerBase {
  kind: 'upi';
  upi: UpiCase;
  /** The amount on the shop's phone (received or requested); 0 when nothing arrived. */
  shown: number;
}
export type Customer = CashCustomer | UpiCustomer;

/** Why an answer was right or wrong; picks the explanation line. */
export type Reason =
  | 'change_right'
  | 'change_short'
  | 'change_over'
  | 'upi_real'
  | 'upi_real_refused'
  | 'upi_fake_screenshot'
  | 'upi_collect_request'
  | 'upi_wrong_amount';

export interface Answer {
  ok: boolean;
  reason: Reason;
}

export const CUSTOMERS_PER_SHIFT = 5;
/** Pay per customer served right; a perfect shift pays the full weekly work wage. */
export const PAY_PER_CUSTOMER = Math.floor(WORK.wage / CUSTOMERS_PER_SHIFT);
/** The change drawer, largest first. */
export const DRAWER = [200, 100, 50, 20, 10, 5, 2, 1] as const;
/** Notes a cash customer may pay with, smallest first. */
const TENDER = [50, 100, 200, 500] as const;

export const ITEMS: readonly Item[] = [
  { id: 'rice', price: 62 },
  { id: 'dal', price: 78 },
  { id: 'soap', price: 35 },
  { id: 'milk', price: 32 },
  { id: 'biscuits', price: 15 },
  { id: 'eggs', price: 42 },
  { id: 'oil', price: 145 },
  { id: 'tea', price: 95 },
  { id: 'bread', price: 45 },
];
const WHO: readonly CustomerId[] = ['aunty', 'uncle', 'student', 'driver', 'dadi'];
const BAD_UPI: readonly UpiCase[] = ['fake_screenshot', 'collect_request', 'wrong_amount'];

/** A short payment that looks close: the last two digits swapped (173 → 137), else ₹10–30 less. */
function shortOf(bill: number, h: number): number {
  const s = String(bill);
  const swapped = Number(s.slice(0, -2) + s.at(-1) + s.at(-2));
  return swapped < bill ? swapped : Math.max(1, bill - 10 * (1 + (h % 3)));
}

/**
 * Deals one shift: five customers, three paying cash and two by UPI (one real payment and one
 * trick), in a seeded order.
 */
export function dealShift(seed: number): Customer[] {
  const kinds = shuffle(['cash', 'cash', 'cash', 'upi', 'upi'] as const, seed, 1);
  const upiCases = shuffle(['real', BAD_UPI[hash(seed, 2) % BAD_UPI.length]!] as UpiCase[], seed, 3);
  const who = shuffle(WHO, seed, 4);
  let nextUpi = 0;
  return kinds.map((kind, i) => {
    const count = 1 + (hash(seed, 5, i) % 3);
    const items = shuffle(ITEMS, seed, 10 + i).slice(0, count);
    const bill = items.reduce((sum, it) => sum + it.price, 0);
    const base = { who: who[i]!, items, bill };
    if (kind === 'cash') {
      const options = TENDER.filter((n) => n > bill);
      // Usually the smallest note that covers the bill; sometimes the next one up.
      const paid = options[Math.min(options.length - 1, hash(seed, 6, i) % 3 === 0 ? 1 : 0)]!;
      return { ...base, kind, paid };
    }
    const upi = upiCases[nextUpi++]!;
    const shown = upi === 'fake_screenshot' ? 0 : upi === 'wrong_amount' ? shortOf(bill, hash(seed, 7, i)) : bill;
    return { ...base, kind, upi, shown };
  });
}

export const changeDue = (c: CashCustomer) => c.paid - c.bill;
export const sumNotes = (notes: readonly number[]) => notes.reduce((s, n) => s + n, 0);

/** Checks the change handed back for a cash customer. */
export function checkChange(c: CashCustomer, given: number): Answer {
  const due = changeDue(c);
  if (given === due) return { ok: true, reason: 'change_right' };
  return { ok: false, reason: given < due ? 'change_short' : 'change_over' };
}

/** Checks the call on a UPI customer: accept only when the full bill reached the shop's phone. */
export function checkUpi(c: UpiCustomer, accept: boolean): Answer {
  if (c.upi === 'real') return { ok: accept, reason: accept ? 'upi_real' : 'upi_real_refused' };
  return { ok: !accept, reason: `upi_${c.upi}` };
}

/** The shift's wage: whole rupees for each customer served right. */
export function shiftWage(answers: readonly Answer[]): number {
  return answers.filter((a) => a.ok).length * PAY_PER_CUSTOMER;
}
