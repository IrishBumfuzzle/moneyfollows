// Cover or Cash?: the hospital's health-cover mini-game. Three years, one choice at the start of
// each: buy a year of Health Shield (a fictional health cover) or keep the premium. The year
// then plays out month by month. Clinic visits and chemist medicines are never covered; a
// hospital stay is, less a 10% co-pay. A bill the savings can't cover becomes a loan that costs
// extra. Practice only: it never touches the story's wallet.
// Pure like the engine: the same seed always deals the same years.
import { shuffle } from '../store/seed';

export type Care = 'clinic' | 'hospital';
export type BillId = 'cold' | 'stomach' | 'eyes' | 'fever_test' | 'dengue' | 'broken_leg' | 'appendix';

export interface Bill {
  id: BillId;
  care: Care;
  cost: number; // whole rupees
}

const CLINIC: readonly Bill[] = [
  { id: 'cold', care: 'clinic', cost: 150 },
  { id: 'stomach', care: 'clinic', cost: 250 },
  { id: 'eyes', care: 'clinic', cost: 500 },
  { id: 'fever_test', care: 'clinic', cost: 400 },
];
const HOSPITAL: readonly Bill[] = [
  { id: 'dengue', care: 'hospital', cost: 9000 },
  { id: 'broken_leg', care: 'hospital', cost: 7500 },
  { id: 'appendix', care: 'hospital', cost: 14000 },
];
export const BILLS: readonly Bill[] = [...CLINIC, ...HOSPITAL];

export const YEARS = 3;
export const PREMIUM = 600;        // one year of Health Shield
export const COPAY_PCT = 10;       // the share of a covered bill the family still pays
export const START_SAVINGS = 2500;
export const YEARLY_SAVING = 1500; // added at the start of each year; repays any loan first
export const LOAN_EXTRA_PCT = 20;  // a loan is paid back with this much extra
/** No hospital stay in the first two months: the waiting period is Claim Desk's lesson, not this one's. */
const FIRST_HOSPITAL_MONTH = 3;

/** quiet: one clinic bill. clinic: three. big: one hospital stay and one clinic bill. */
export type YearKind = 'quiet' | 'clinic' | 'big';

export interface Year {
  kind: YearKind;
  months: (Bill | null)[]; // 12 entries, January first
}

/** Deals the three years: one of each kind, in a seeded order, bills in seeded months. */
export function dealSeason(seed: number): Year[] {
  const kinds = shuffle<YearKind>(['quiet', 'clinic', 'big'], seed, 1);
  const clinic = shuffle(CLINIC, seed, 2);
  const hospital = shuffle(HOSPITAL, seed, 3)[0]!;
  let next = 0; // clinic bills are dealt without repeats across the season
  const takeClinic = () => clinic[next++ % clinic.length]!;
  return kinds.map((kind, y) => {
    const months: (Bill | null)[] = Array.from({ length: 12 }, () => null);
    const order = shuffle(Array.from({ length: 12 }, (_, i) => i), seed, 10 + y);
    if (kind === 'big') {
      const at = order.find((m) => m + 1 >= FIRST_HOSPITAL_MONTH)!;
      months[at] = hospital;
      months[order.find((m) => m !== at)!] = takeClinic();
    } else {
      for (const m of order.slice(0, kind === 'quiet' ? 1 : 3)) months[m] = takeClinic();
    }
    return { kind, months };
  });
}

export interface BillLine {
  month: number;      // 1–12
  bill: Bill;
  covered: boolean;
  youPay: number;
  shieldPays: number;
}

export interface YearResult {
  bought: boolean;
  income: number;      // this year's saving
  repaid: number;      // of which went to last year's loan
  premium: number;     // 0 if skipped
  lines: BillLine[];
  youPaid: number;     // bill money the family paid (not the premium)
  shieldPaid: number;
  borrowed: number;    // the shortfall taken as a loan
  savings: number;     // at the end of the year
  debt: number;        // owed at the end of the year, with the loan's extra
}

export interface Season {
  savings: number;
  debt: number;
  results: YearResult[];
}

export const startSeason = (): Season => ({ savings: START_SAVINGS, debt: 0, results: [] });

/** Plays one year with or without cover. Never mutates its input. */
export function playYear(season: Season, year: Year, bought: boolean): Season {
  const repaid = Math.min(season.debt, YEARLY_SAVING);
  let debt = season.debt - repaid;
  let savings = season.savings + YEARLY_SAVING - repaid;
  const premium = bought ? PREMIUM : 0;
  savings -= premium; // a year's saving is always more than the premium, so this stays ≥ 0

  const lines: BillLine[] = [];
  let borrowed = 0;
  year.months.forEach((bill, i) => {
    if (!bill) return;
    const covered = bought && bill.care === 'hospital';
    const youPay = covered ? Math.round((bill.cost * COPAY_PCT) / 100) : bill.cost;
    lines.push({ month: i + 1, bill, covered, youPay, shieldPays: bill.cost - youPay });
    const fromSavings = Math.min(savings, youPay);
    savings -= fromSavings;
    borrowed += youPay - fromSavings;
  });
  debt += Math.ceil((borrowed * (100 + LOAN_EXTRA_PCT)) / 100);

  const result: YearResult = {
    bought,
    income: YEARLY_SAVING,
    repaid,
    premium,
    lines,
    youPaid: lines.reduce((s, l) => s + l.youPay, 0),
    shieldPaid: lines.reduce((s, l) => s + l.shieldPays, 0),
    borrowed,
    savings,
    debt,
  };
  return { savings, debt, results: [...season.results, result] };
}

/** The season as it stood before year `i` (0-based) was played. */
export function seasonBefore(season: Season, i: number): Season {
  if (i <= 0) return startSeason();
  const r = season.results[i - 1]!;
  return { savings: r.savings, debt: r.debt, results: season.results.slice(0, i) };
}

/** Year `i` replayed with the other choice: the path not taken. */
export function otherPath(season: Season, years: readonly Year[], i: number): YearResult {
  const s = playYear(seasonBefore(season, i), years[i]!, !season.results[i]!.bought);
  return s.results[i]!;
}

/** Plays the years with one choice each (true = bought cover). */
export function playSeason(years: readonly Year[], choices: readonly boolean[]): Season {
  return choices.reduce((s, bought, i) => playYear(s, years[i]!, bought), startSeason());
}

/** Savings minus what is owed: one number to compare paths by. */
export const netWorth = (s: Season) => s.savings - s.debt;

export type CoverLesson = 'saved' | 'hit' | 'hit_loan';

/** The end lesson: what happened in the year with the hospital stay. */
export function coverLesson(years: readonly Year[], season: Season): CoverLesson {
  const big = years.findIndex((y) => y.kind === 'big');
  const r = season.results[big]!;
  return r.bought ? 'saved' : r.borrowed > 0 ? 'hit_loan' : 'hit';
}
