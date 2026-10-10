import type { LifeEffects, ShortMode, TKey } from '../life/types';

export type { TKey };

/** One way to answer an event or a phone thread. */
export interface EventChoice {
  id: string;
  label: TKey;                 // ≤ 40 chars (CLAUDE.md 7.2)
  effects: LifeEffects;
  ifShort?: ShortMode;         // default 'block'
  reply?: TKey;                // what the other side says back (phone)
  outcome: TKey;               // what happened, one line
  lesson: TKey;                // ≤ 140 chars
  rating: 'best' | 'ok' | 'risky';
}

/** A sudden in-person event, e.g. an injury that ends at the hospital. */
export interface SuddenEvent {
  id: string;
  kind: 'sudden';
  title: TKey;
  story: TKey;                 // uses {{name}} for the persona
  hit: LifeEffects;            // applied the moment it happens (e.g. health −30)
  billTitle: TKey;
  bill: TKey;
  choices: EventChoice[];
}

/** A phone chat: a scam to spot, or a real chance to earn. */
export interface PhoneThread {
  id: string;
  kind: 'phone';
  verdict: 'scam' | 'legit';
  sender: TKey;
  number: string;              // shown under the sender; fictional
  icon: 'warn' | 'person' | 'school';
  messages: TKey[];            // their messages, in order; use {{name}}
  choices: EventChoice[];
  redFlags?: TKey[];           // scam.why.* keys (BE-1's strings), shown after the choice
}

export type GameEvent = SuddenEvent | PhoneThread;
