// The Message Inspector on the phone's Messages threads. A thread's red flags (events/data.ts)
// are a list for the whole thread, so this maps each message line to the reason that belongs to
// it, reusing BE-1's scam.why.* strings. Honest threads have no entry: every line inspects as
// "nothing odd". The Inspect button shows on every thread, so it never gives the answer away.
import type { ScamMessage } from '@paisa/shared';
import type { PhoneThread } from '../events/types';

/** Per message line: the scam.why.* key for that line, or null for an ordinary line. */
export const LINE_FLAGS: Record<string, readonly (string | null)[]> = {
  'phone.kyc.01': ['t:scam.why.urgency', 't:scam.why.link'],
  'phone.lottery.01': ['t:scam.why.too_good', 't:scam.why.upfront_fee'],
  'phone.double.01': ['t:scam.why.too_good', 't:scam.why.urgency'],
  'phone.otp.01': ['t:scam.why.unknown_sender', 't:scam.why.asks_otp'],
};

/** A thread as a Message Inspector card (practice view: no verdict is shown from it). */
export function threadMessage(thread: PhoneThread): ScamMessage {
  const flags = LINE_FLAGS[thread.id] ?? [];
  return {
    id: thread.id,
    channel: 'sms',
    levels: ['starter', 'explorer', 'planner'],
    sender: thread.sender,
    segments: thread.messages.map((text, i) => {
      const why = flags[i];
      return why ? { text, suspicious: why as ScamMessage['sender'] } : { text };
    }),
    verdict: thread.verdict === 'scam' ? 'scam' : 'safe',
    explanation: thread.sender,
    meta: { status: 'draft', author: 'ui-1' },
  };
}
