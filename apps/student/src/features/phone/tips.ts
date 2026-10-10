// The Vanguard app's tips: short, reviewed lessons bundled with the app (works offline). The
// backend only chooses which ids to show (docs/phone-api.md §3). Educate, never recommend
// (CLAUDE.md 7.2): no products, no "you should invest", no guarantees.
import type { Pillar } from '@paisa/shared';

export interface Tip {
  id: string;
  pillar: Pillar;
}

export const TIPS: Tip[] = [
  { id: 'tip.needs_first', pillar: 'plan_budget' },
  { id: 'tip.emergency_fund', pillar: 'save_manage' },
  { id: 'tip.time_helps', pillar: 'understand_investing' },
  { id: 'tip.risk_and_return', pillar: 'understand_investing' },
  { id: 'tip.otp_never', pillar: 'stay_safe' },
];
