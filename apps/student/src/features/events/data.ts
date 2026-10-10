// Event content: one sudden injury (hospital bill) and phone threads, scams and real chances to
// earn. Stand-in for BE-1's packages/content/events (its event.hospital.01 has the same
// pay / borrow / wait shape). Amounts are whole rupees and placeholders.
//
// Guardrails (CLAUDE.md 7.2): no real banks, apps or schemes; investing only appears as a scam
// to spot, or as a pointer to the Bank, where the fictional assets and AssumptionBanner live.
// Real offers to earn are earned income (a tutoring hour, a shift at a shop), never free money.
import type { GameEvent, PhoneCall, PhoneThread, SuddenEvent } from './types';

export const INJURY: SuddenEvent = {
  id: 'event.injury.01',
  kind: 'sudden',
  title: 't:events.injury.title',
  story: 't:events.injury.story',
  hit: { health: -15, sanity: -3 },
  billTitle: 't:events.injury.bill_title',
  bill: 't:events.injury.bill',
  choices: [
    {
      id: 'pay',
      label: 't:events.injury.pay.label',
      effects: { money: -600, health: 13 },
      outcome: 't:events.injury.pay.outcome',
      lesson: 't:events.injury.pay.lesson',
      rating: 'best',
    },
    {
      id: 'borrow',
      label: 't:events.injury.borrow.label',
      effects: { debt: 600, health: 13, sanity: -3 },
      outcome: 't:events.injury.borrow.outcome',
      lesson: 't:events.injury.borrow.lesson',
      rating: 'ok',
    },
    {
      id: 'rest',
      label: 't:events.injury.rest.label',
      effects: { health: 3, sanity: -5 },
      outcome: 't:events.injury.rest.outcome',
      lesson: 't:events.injury.rest.lesson',
      rating: 'risky',
    },
  ],
};

const scam = (t: Omit<PhoneThread, 'kind' | 'verdict'>): PhoneThread => ({ ...t, kind: 'phone', verdict: 'scam' });
const legit = (t: Omit<PhoneThread, 'kind' | 'verdict'>): PhoneThread => ({ ...t, kind: 'phone', verdict: 'legit' });

export const THREADS: PhoneThread[] = [
  scam({
    id: 'phone.kyc.01',
    sender: 't:events.kyc.sender',
    number: 'VK-ALERTS',
    icon: 'warn',
    messages: ['t:events.kyc.m1', 't:events.kyc.m2'],
    choices: [
      {
        id: 'tap',
        label: 't:events.kyc.tap.label',
        effects: { money: -500, sanity: -5 },
        ifShort: 'all',
        outcome: 't:events.kyc.tap.outcome',
        lesson: 't:events.kyc.lesson',
        rating: 'risky',
      },
      {
        id: 'ignore',
        label: 't:events.kyc.ignore.label',
        effects: { sanity: 1 },
        outcome: 't:events.kyc.ignore.outcome',
        lesson: 't:events.kyc.lesson',
        rating: 'best',
      },
    ],
    redFlags: ['t:scam.why.urgency', 't:scam.why.link', 't:scam.why.unknown_sender'],
  }),
  legit({
    id: 'phone.tuition.01',
    sender: 't:events.tuition.sender',
    number: '+91 98•••• ••214',
    icon: 'person',
    messages: ['t:events.tuition.m1', 't:events.tuition.m2'],
    choices: [
      {
        id: 'accept',
        label: 't:events.tuition.accept.label',
        effects: { money: 300, sanity: -2 },
        reply: 't:events.tuition.accept.reply',
        outcome: 't:events.tuition.accept.outcome',
        lesson: 't:events.tuition.lesson',
        rating: 'best',
      },
      {
        id: 'decline',
        label: 't:events.tuition.decline.label',
        effects: { sanity: 1 },
        reply: 't:events.tuition.decline.reply',
        outcome: 't:events.tuition.decline.outcome',
        lesson: 't:events.tuition.lesson',
        rating: 'ok',
      },
    ],
  }),
  scam({
    id: 'phone.lottery.01',
    sender: 't:events.lottery.sender',
    number: '+91 70•••• ••883',
    icon: 'warn',
    messages: ['t:events.lottery.m1', 't:events.lottery.m2'],
    choices: [
      {
        id: 'pay',
        label: 't:events.lottery.pay.label',
        effects: { money: -299, sanity: -4 },
        ifShort: 'all',
        reply: 't:events.lottery.pay.reply',
        outcome: 't:events.lottery.pay.outcome',
        lesson: 't:events.lottery.lesson',
        rating: 'risky',
      },
      {
        id: 'block',
        label: 't:events.lottery.block.label',
        effects: { sanity: 1 },
        outcome: 't:events.lottery.block.outcome',
        lesson: 't:events.lottery.lesson',
        rating: 'best',
      },
    ],
    redFlags: ['t:scam.why.too_good', 't:scam.why.upfront_fee', 't:scam.why.unknown_sender'],
  }),
  legit({
    id: 'phone.savings_club.01',
    sender: 't:events.club.sender',
    number: 'SC-NOTICE',
    icon: 'school',
    messages: ['t:events.club.m1', 't:events.club.m2'],
    choices: [
      {
        id: 'visit',
        label: 't:events.club.visit.label',
        effects: {},
        reply: 't:events.club.visit.reply',
        outcome: 't:events.club.visit.outcome',
        lesson: 't:events.club.lesson',
        rating: 'best',
      },
      {
        id: 'later',
        label: 't:events.club.later.label',
        effects: {},
        outcome: 't:events.club.later.outcome',
        lesson: 't:events.club.lesson',
        rating: 'ok',
      },
    ],
  }),
  scam({
    id: 'phone.double.01',
    sender: 't:events.double.sender',
    number: '+91 62•••• ••019',
    icon: 'warn',
    messages: ['t:events.double.m1', 't:events.double.m2'],
    choices: [
      {
        id: 'send',
        label: 't:events.double.send.label',
        effects: { money: -1000, sanity: -6 },
        ifShort: 'all',
        reply: 't:events.double.send.reply',
        outcome: 't:events.double.send.outcome',
        lesson: 't:events.double.lesson',
        rating: 'risky',
      },
      {
        id: 'ignore',
        label: 't:events.double.ignore.label',
        effects: { sanity: 1 },
        outcome: 't:events.double.ignore.outcome',
        lesson: 't:events.double.lesson',
        rating: 'best',
      },
    ],
    redFlags: ['t:scam.why.too_good', 't:scam.why.urgency', 't:scam.why.unknown_sender'],
  }),
  legit({
    id: 'phone.shop_shift.01',
    sender: 't:events.shift.sender',
    number: '+91 99•••• ••560',
    icon: 'person',
    messages: ['t:events.shift.m1', 't:events.shift.m2'],
    choices: [
      {
        id: 'accept',
        label: 't:events.shift.accept.label',
        effects: { money: 250, sanity: -3 },
        reply: 't:events.shift.accept.reply',
        outcome: 't:events.shift.accept.outcome',
        lesson: 't:events.shift.lesson',
        rating: 'best',
      },
      {
        id: 'decline',
        label: 't:events.shift.decline.label',
        effects: {},
        reply: 't:events.shift.decline.reply',
        outcome: 't:events.shift.decline.outcome',
        lesson: 't:events.shift.lesson',
        rating: 'ok',
      },
    ],
  }),
  scam({
    id: 'phone.otp.01',
    sender: 't:events.otp.sender',
    number: '+91 81•••• ••447',
    icon: 'warn',
    messages: ['t:events.otp.m1', 't:events.otp.m2'],
    choices: [
      {
        id: 'share',
        label: 't:events.otp.share.label',
        effects: { money: -800, sanity: -6 },
        ifShort: 'all',
        reply: 't:events.otp.share.reply',
        outcome: 't:events.otp.share.outcome',
        lesson: 't:events.otp.lesson',
        rating: 'risky',
      },
      {
        id: 'refuse',
        label: 't:events.otp.refuse.label',
        effects: { sanity: 1 },
        outcome: 't:events.otp.refuse.outcome',
        lesson: 't:events.otp.lesson',
        rating: 'best',
      },
    ],
    redFlags: ['t:scam.why.asks_otp', 't:scam.why.urgency', 't:scam.why.unknown_sender'],
  }),
];

export const CALLS: PhoneCall[] = [
  {
    id: 'call.bank_officer.01',
    kind: 'call',
    verdict: 'scam',
    caller: 't:events.call_bank.caller',
    number: '+91 88•••• ••302',
    icon: 'warn',
    lines: ['t:events.call_bank.l1', 't:events.call_bank.l2'],
    choices: [
      {
        id: 'tell',
        label: 't:events.call_bank.tell.label',
        effects: { money: -700, sanity: -6 },
        ifShort: 'all',
        reply: 't:events.call_bank.tell.reply',
        outcome: 't:events.call_bank.tell.outcome',
        lesson: 't:events.call_bank.lesson',
        rating: 'risky',
      },
      {
        id: 'hang_up',
        label: 't:events.call_bank.hang_up.label',
        effects: { sanity: 1 },
        outcome: 't:events.call_bank.hang_up.outcome',
        lesson: 't:events.call_bank.lesson',
        rating: 'best',
      },
    ],
    redFlags: ['t:scam.why.asks_otp', 't:scam.why.urgency', 't:scam.why.unknown_sender'],
  },
  {
    id: 'call.ammi_groceries.01',
    kind: 'call',
    verdict: 'legit',
    caller: 't:events.call_ammi.caller',
    number: '+91 94•••• ••118',
    icon: 'person',
    lines: ['t:events.call_ammi.l1', 't:events.call_ammi.l2'],
    choices: [
      {
        id: 'help',
        label: 't:events.call_ammi.help.label',
        effects: { money: -150, sanity: 2 },
        reply: 't:events.call_ammi.help.reply',
        outcome: 't:events.call_ammi.help.outcome',
        lesson: 't:events.call_ammi.lesson',
        rating: 'best',
      },
      {
        id: 'later',
        label: 't:events.call_ammi.later.label',
        effects: { sanity: -1 },
        reply: 't:events.call_ammi.later.reply',
        outcome: 't:events.call_ammi.later.outcome',
        lesson: 't:events.call_ammi.lesson',
        rating: 'ok',
      },
    ],
  },
];

export const EVENTS: GameEvent[] = [INJURY, ...THREADS, ...CALLS];

export function getEvent(id: string): GameEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}

/**
 * When each event arrives, counted in "steps" (map visits and actions on the map). A stand-in for
 * the engine's event deck: deterministic, so every demo plays the same. The injury lands after
 * the player has had a chance to spend, so the emergency-fund lesson bites.
 */
export const SCHEDULE: { step: number; id: string }[] = [
  { step: 2, id: 'phone.kyc.01' },
  { step: 3, id: 'call.ammi_groceries.01' },
  { step: 4, id: 'phone.tuition.01' },
  { step: 5, id: INJURY.id },
  { step: 7, id: 'phone.lottery.01' },
  { step: 8, id: 'call.bank_officer.01' },
  { step: 9, id: 'phone.savings_club.01' },
  { step: 11, id: 'phone.double.01' },
  { step: 13, id: 'phone.shop_shift.01' },
  { step: 15, id: 'phone.otp.01' },
];
