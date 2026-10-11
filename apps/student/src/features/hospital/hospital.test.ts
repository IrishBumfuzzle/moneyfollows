import { describe, expect, it } from 'vitest';
import {
  CLAIMS_PER_ROUND,
  HEALTH_CLAIMS,
  LIFE_CLAIMS,
  dealClaims,
  judge,
  score,
  split,
} from './claims';
import {
  BILLS,
  COPAY_PCT,
  LOAN_EXTRA_PCT,
  PREMIUM,
  START_SAVINGS,
  YEARLY_SAVING,
  YEARS,
  coverLesson,
  dealSeason,
  netWorth,
  otherPath,
  playSeason,
  playYear,
  startSeason,
} from './cover';
import type { Year } from './cover';
import { STRINGS } from './content';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);
const bill = (id: string) => BILLS.find((b) => b.id === id)!;
const yearWith = (at: Record<number, string>): Year => ({
  kind: Object.values(at).some((id) => bill(id).care === 'hospital') ? 'big' : 'clinic',
  months: Array.from({ length: 12 }, (_, i) => (at[i + 1] ? bill(at[i + 1]!) : null)),
});

describe('dealSeason', () => {
  it('is deterministic', () => {
    expect(dealSeason(9)).toEqual(dealSeason(9));
  });

  it('deals one year of each kind, with the hospital stay after the first two months', () => {
    for (const seed of SEEDS) {
      const years = dealSeason(seed);
      expect(years).toHaveLength(YEARS);
      expect(years.map((y) => y.kind).sort()).toEqual(['big', 'clinic', 'quiet']);
      for (const y of years) {
        expect(y.months).toHaveLength(12);
        const bills = y.months.filter((b) => b !== null);
        const stays = y.months.map((b, i) => (b?.care === 'hospital' ? i + 1 : 0)).filter(Boolean);
        expect(bills).toHaveLength({ quiet: 1, clinic: 3, big: 2 }[y.kind]);
        expect(stays).toHaveLength(y.kind === 'big' ? 1 : 0);
        for (const m of stays) expect(m).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('playYear', () => {
  it('covers a hospital stay less the co-pay, and never a clinic visit', () => {
    const s = playYear(startSeason(), yearWith({ 2: 'cold', 5: 'dengue' }), true);
    const [cold, dengue] = s.results[0]!.lines;
    expect(cold).toMatchObject({ covered: false, youPay: 150, shieldPays: 0 });
    expect(dengue).toMatchObject({ covered: true, youPay: (9000 * COPAY_PCT) / 100, shieldPays: 8100 });
    expect(s.savings).toBe(START_SAVINGS + YEARLY_SAVING - PREMIUM - 150 - 900);
    expect(s.debt).toBe(0);
  });

  it('turns a bill the savings cannot cover into a loan that costs extra', () => {
    const s = playYear(startSeason(), yearWith({ 4: 'appendix' }), false);
    const shortfall = 14000 - (START_SAVINGS + YEARLY_SAVING);
    expect(s.savings).toBe(0);
    expect(s.results[0]!.borrowed).toBe(shortfall);
    expect(s.debt).toBe((shortfall * (100 + LOAN_EXTRA_PCT)) / 100);
  });

  it("repays a loan from next year's saving first", () => {
    const one = playYear(startSeason(), yearWith({ 4: 'appendix' }), false);
    const two = playYear(one, yearWith({}), false);
    expect(two.results[1]!.repaid).toBe(YEARLY_SAVING);
    expect(two.debt).toBe(one.debt - YEARLY_SAVING);
    expect(two.savings).toBe(0);
  });

  it('never mutates its input, and money never goes negative', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const years = dealSeason(seed);
      for (const mask of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const choices = years.map((_, i) => Boolean(mask & (1 << i)));
        const before = startSeason();
        const frozen = JSON.stringify(before);
        const s = choices.reduce((acc, b, i) => playYear(acc, years[i]!, b), before);
        expect(JSON.stringify(before)).toBe(frozen);
        for (const r of s.results) {
          expect(r.savings).toBeGreaterThanOrEqual(0);
          expect(r.debt).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('otherPath', () => {
  it('replays one year with the other choice from where that year began', () => {
    const years = dealSeason(11);
    const s = playSeason(years, [true, false, true]);
    expect(otherPath(s, years, 0)).toEqual(playSeason(years, [false]).results[0]);
    expect(otherPath(s, years, 1)).toEqual(playSeason(years, [true, true]).results[1]);
    expect(otherPath(s, years, 2)).toEqual(playSeason(years, [true, false, false]).results[2]);
  });
});

describe('the lesson the season teaches', () => {
  it('cover always comes out ahead in the year with the hospital stay', () => {
    for (const seed of SEEDS) {
      const years = dealSeason(seed);
      const always = playSeason(years, [true, true, true]);
      const never = playSeason(years, [false, false, false]);
      expect(netWorth(always)).toBeGreaterThan(netWorth(never));
      expect(coverLesson(years, always)).toBe('saved');
      expect(coverLesson(years, never)).not.toBe('saved');
    }
  });

  it('cover costs more than it pays back in a year with no hospital stay', () => {
    for (const seed of SEEDS) {
      const years = dealSeason(seed);
      years.forEach((y, i) => {
        if (y.kind === 'big') return;
        const before = playSeason(years.slice(0, i), years.slice(0, i).map(() => true));
        expect(netWorth(playYear(before, y, true))).toBeLessThan(netWorth(playYear(before, y, false)));
      });
    }
  });
});

describe('dealClaims', () => {
  it('is deterministic', () => {
    expect(dealClaims(5)).toEqual(dealClaims(5));
  });

  it('deals four health and two life claims, each policy with a yes and a no', () => {
    for (const seed of SEEDS) {
      const round = dealClaims(seed);
      expect(round).toHaveLength(CLAIMS_PER_ROUND);
      expect(new Set(round.map((c) => c.id)).size).toBe(CLAIMS_PER_ROUND);
      for (const policy of ['health', 'life'] as const) {
        const mine = round.filter((c) => c.policy === policy);
        expect(mine.some((c) => c.covered)).toBe(true);
        expect(mine.some((c) => !c.covered)).toBe(true);
      }
      expect(round.filter((c) => c.policy === 'life')).toHaveLength(2);
    }
  });
});

describe('claims', () => {
  it('splits a covered stay by the co-pay, and a refused bill falls on the family', () => {
    const dengue = HEALTH_CLAIMS.find((c) => c.id === 'dengue')!;
    expect(split(dengue)).toEqual({ youPay: 900, policyPays: 8100 });
    const clinic = HEALTH_CLAIMS.find((c) => c.id === 'cough_clinic')!;
    expect(split(clinic)).toEqual({ youPay: 300, policyPays: 0 });
  });

  it('accidents are covered with no waiting period; new illness is not', () => {
    expect(HEALTH_CLAIMS.find((c) => c.reason === 'accident')!.covered).toBe(true);
    expect(HEALTH_CLAIMS.find((c) => c.reason === 'waiting')!.covered).toBe(false);
  });

  it('judges and scores answers', () => {
    const round = dealClaims(1);
    const right = round.map((c) => judge(c, c.covered));
    const wrong = round.map((c) => judge(c, !c.covered));
    expect(score(right)).toBe(CLAIMS_PER_ROUND);
    expect(score(wrong)).toBe(0);
  });
});

describe('hospital strings', () => {
  it('has every key in English and Hindi, with the same {{vars}}', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const [k, v] of Object.entries(STRINGS.en!)) expect(vars(STRINGS.hi![k]!), k).toEqual(vars(v));
  });

  it('names every bill and explains every claim', () => {
    const en = STRINGS.en!;
    for (const b of BILLS) expect(en[`cover.bill.${b.id}`], b.id).toBeDefined();
    for (const c of [...HEALTH_CLAIMS, ...LIFE_CLAIMS]) {
      expect(en[`claims.case.${c.id}`], c.id).toBeDefined();
      expect(en[`claims.why.${c.reason}`], c.reason).toBeDefined();
      expect(en[`claims.who.${c.who}`], c.who).toBeDefined();
    }
  });

  it('never promises or recommends (CLAUDE.md 7.2)', () => {
    const banned = /guarantee|risk[- ]free|you should buy|you must buy|best (plan|policy)|गारंटी/i;
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang]!)) expect(v, `${lang}:${k}`).not.toMatch(banned);
    }
  });
});
