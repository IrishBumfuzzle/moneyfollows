// Claim Desk: the hospital's insurance-desk mini-game. The player helps at the desk and judges
// each claim against the policy card: covered or not? Health claims use Health Shield (the same
// fictional cover as Cover or Cash?); life claims use Family Umbrella, a fictional 20-year life
// cover. Practice only: it never touches the story's wallet.
// Pure like the engine: the same seed always deals the same claims.
import { COPAY_PCT } from './cover';
import { shuffle } from '../store/seed';

export type PolicyId = 'health' | 'life';

/** Why a claim is or isn't paid; each has a policy rule and an explanation string. */
export type ClaimReason =
  | 'stay'        // a hospital stay: covered, less the co-pay
  | 'accident'    // an accident is covered from day one, no waiting period
  | 'waiting'     // illness in the first 30 days
  | 'opd'         // clinic visit or chemist medicines without a stay
  | 'cosmetic'    // treatment for looks
  | 'lapsed'      // premium not paid
  | 'life_paid'   // the insured person died during the term
  | 'term_end'    // the term ended; nothing comes back
  | 'life_lapsed';

export interface Claim {
  id: string;
  policy: PolicyId;
  who: 'aunty' | 'uncle' | 'dadi' | 'student' | 'driver' | 'neighbour';
  bill: number;      // whole rupees: the hospital bill, or the life cover's amount
  covered: boolean;
  reason: ClaimReason;
}

export const LIFE_COVER = 1000000;  // what Family Umbrella pays the family
export const LIFE_YEARS = 20;
export const WAITING_DAYS = 30;

const health = (id: string, who: Claim['who'], bill: number, reason: ClaimReason): Claim => ({
  id,
  policy: 'health',
  who,
  bill,
  covered: reason === 'stay' || reason === 'accident',
  reason,
});
const life = (id: string, who: Claim['who'], reason: ClaimReason): Claim => ({
  id,
  policy: 'life',
  who,
  bill: LIFE_COVER,
  covered: reason === 'life_paid',
  reason,
});

export const HEALTH_CLAIMS: readonly Claim[] = [
  health('dengue', 'aunty', 9000, 'stay'),
  health('appendix', 'student', 14000, 'stay'),
  health('bus_accident', 'driver', 7500, 'accident'),
  health('typhoid_new', 'uncle', 6000, 'waiting'),
  health('cough_clinic', 'dadi', 300, 'opd'),
  health('chemist', 'neighbour', 450, 'opd'),
  health('teeth_whitening', 'student', 4000, 'cosmetic'),
  health('fever_lapsed', 'uncle', 5000, 'lapsed'),
];
export const LIFE_CLAIMS: readonly Claim[] = [
  life('life_paid', 'aunty', 'life_paid'),
  life('term_end', 'uncle', 'term_end'),
  life('life_lapsed', 'neighbour', 'life_lapsed'),
];

export const HEALTH_PER_ROUND = 4;
export const LIFE_PER_ROUND = 2;
export const CLAIMS_PER_ROUND = HEALTH_PER_ROUND + LIFE_PER_ROUND;

/**
 * Deals one round: four health claims and two life claims, shuffled. Each policy gets at least
 * one claim that is paid and one that isn't, so "always covered" or "never covered" can't win.
 */
export function dealClaims(seed: number): Claim[] {
  const pick = (bank: readonly Claim[], n: number, salt: number) => {
    const s = shuffle(bank, seed, salt);
    const yes = s.find((c) => c.covered)!;
    const no = s.find((c) => !c.covered)!;
    return [yes, no, ...s.filter((c) => c !== yes && c !== no).slice(0, n - 2)];
  };
  return shuffle([...pick(HEALTH_CLAIMS, HEALTH_PER_ROUND, 1), ...pick(LIFE_CLAIMS, LIFE_PER_ROUND, 2)], seed, 3);
}

/** Who pays what on a claim: the family's share and the policy's share. */
export function split(claim: Claim): { youPay: number; policyPays: number } {
  if (!claim.covered) return { youPay: claim.policy === 'health' ? claim.bill : 0, policyPays: 0 };
  if (claim.policy === 'life') return { youPay: 0, policyPays: claim.bill };
  const youPay = Math.round((claim.bill * COPAY_PCT) / 100);
  return { youPay, policyPays: claim.bill - youPay };
}

export interface Verdict {
  claimId: string;
  ok: boolean;
}

export const judge = (claim: Claim, saysCovered: boolean): Verdict => ({ claimId: claim.id, ok: saysCovered === claim.covered });

export const score = (verdicts: readonly Verdict[]) => verdicts.filter((v) => v.ok).length;
