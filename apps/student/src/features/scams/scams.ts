// Scam or Safe? (CLAUDE.md 2): one message a round, shown as a phone card. The player inspects
// lines (the Message Inspector), then calls it Scam or Safe and sees why. Practice only: nothing
// here touches the wallet. Pure: the same seed deals the same rounds.
import { content } from '@paisa/content';
import type { ScamMessage } from '@paisa/shared';
import { shuffle } from '../store/seed';

export const ROUNDS = 6;
/** A round mixes tricks and honest messages, so "always Scam" never wins. */
const SAFE_PER_ROUND = 2;

/** Every message in the content pack (packages/content/minigames/scam-or-safe.json). */
export const MESSAGES: readonly ScamMessage[] = content.scamMessages;

/** Deals one game: ROUNDS messages, SAFE_PER_ROUND of them honest, in a seeded order. */
export function dealGame(seed: number, messages: readonly ScamMessage[] = MESSAGES): ScamMessage[] {
  const safe = shuffle(messages.filter((m) => m.verdict === 'safe'), seed, 1);
  const scams = shuffle(messages.filter((m) => m.verdict === 'scam'), seed, 2);
  const nSafe = Math.min(SAFE_PER_ROUND, safe.length);
  const picked = [...safe.slice(0, nSafe), ...scams.slice(0, ROUNDS - nSafe)];
  return shuffle(picked, seed, 3);
}

export type Verdict = ScamMessage['verdict'];

export interface Call {
  id: string;
  pick: Verdict;
  ok: boolean;
  /** Suspicious lines the player inspected before calling it. */
  found: number;
  /** Suspicious lines in the message. */
  flags: number;
}

/** Index of each suspicious line in a message. */
export const flagged = (m: ScamMessage) =>
  m.segments.flatMap((s, i) => (s.suspicious ? [i] : []));

/** Records a call on a message, given which lines were inspected. */
export function judge(m: ScamMessage, pick: Verdict, inspected: ReadonlySet<number>): Call {
  const flags = flagged(m);
  return { id: m.id, pick, ok: pick === m.verdict, found: flags.filter((i) => inspected.has(i)).length, flags: flags.length };
}

export interface GameResult {
  correct: number;
  total: number;
  score: number; // 0–100
  /** Warning signs found by inspecting, out of all the signs in the game. */
  found: number;
  flags: number;
}

export function scoreGame(calls: readonly Call[]): GameResult {
  const correct = calls.filter((c) => c.ok).length;
  const total = calls.length;
  return {
    correct,
    total,
    score: total ? Math.round((100 * correct) / total) : 0,
    found: calls.reduce((s, c) => s + c.found, 0),
    flags: calls.reduce((s, c) => s + c.flags, 0),
  };
}

/** The only outbound links the game may show (CLAUDE.md 7.2 rule 6). */
export const HELP_LINKS = { helpline: 'tel:1930', portal: 'https://cybercrime.gov.in' } as const;
