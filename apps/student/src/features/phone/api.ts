// What the phone takes from and sends to the backend (docs/phone-api.md).
//
// In: the Vanguard app's tips of the week and the Time Machine's assumed growth rates. Both are
// proposed additive fields on class_status (§3); until the backend sends them the app uses the
// bundled tips and the placeholder rates in @paisa/shared (CLAUDE.md 5.4). Tips are ids of
// bundled, reviewed strings, never free text from the server.
// Out: Snake results as minigame_complete, calls as event_triggered (both accepted today), and
// app opens as phone_app_opened (proposed; not sent until the backend accepts it).
import { GROWTH_RATES } from '@paisa/shared';
import type { GrowthRates } from '@paisa/shared';
import { get, set } from 'idb-keyval';
import { api } from '../../api/client';
import { track } from '../../api/track';
import { TIPS } from './tips';

export type PhoneApp = 'messages' | 'calls' | 'vanguard' | 'snake' | 'scams';

export interface VanguardFeed {
  tips: string[];          // tip ids, in the order to show
  rates: GrowthRates;
}

const CACHE_KEY = 'paisa.phone.vanguard';
const TIMEOUT_MS = 1500;
export const DEFAULT_FEED: VanguardFeed = { tips: TIPS.map((t) => t.id), rates: GROWTH_RATES };

/** Keeps only known tip ids and sane, ordered rates (0–30%, low ≤ avg ≤ high). Never throws. */
export function normalizeFeed(raw: unknown): VanguardFeed {
  const r = (raw ?? {}) as { tips?: unknown; growth_rates?: unknown };
  const known = new Set(TIPS.map((t) => t.id));
  const tips = Array.isArray(r.tips) ? r.tips.filter((id): id is string => typeof id === 'string' && known.has(id)) : [];
  const g = (r.growth_rates ?? {}) as Partial<Record<keyof GrowthRates, unknown>>;
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 0.3;
  const rates = ok(g.low) && ok(g.avg) && ok(g.high) && g.low <= g.avg && g.avg <= g.high ? { low: g.low, avg: g.avg, high: g.high } : GROWTH_RATES;
  return { tips: tips.length ? [...new Set(tips)] : DEFAULT_FEED.tips, rates };
}

/** The class's Vanguard feed: from the server when online (≤ 1.5 s), else the last saved, else bundled. */
export async function loadVanguardFeed(student: { anonId: string; classId: string }): Promise<VanguardFeed> {
  if (api) {
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
      // `vanguard` is the proposed additive field on class_status (docs/phone-api.md §3).
      const status = (await Promise.race([api.classStatus(student.anonId, student.classId), timeout])) as { vanguard?: unknown };
      if (status.vanguard !== undefined) {
        const feed = normalizeFeed(status.vanguard);
        await set(CACHE_KEY, feed).catch(() => {});
        return feed;
      }
    } catch {
      /* offline: fall through */
    }
  }
  try {
    const saved = await get<unknown>(CACHE_KEY);
    if (saved) return normalizeFeed({ tips: (saved as VanguardFeed).tips, growth_rates: (saved as VanguardFeed).rates });
  } catch {
    /* storage blocked */
  }
  return DEFAULT_FEED;
}

/** A finished Scam or Safe? game (practice: never touches the wallet). Same payload as the store games. */
export function trackScamGame(r: { correct: number; total: number; score: number }): void {
  track('minigame_complete', { game: 'scam_or_safe', correct: r.correct, total: r.total, score: r.score });
}

/** A finished Snake game. Accepted today: minigame_complete keeps game and score. */
export function trackSnake(score: number): void {
  track('minigame_complete', { game: 'snake', score });
}

/**
 * Flip to true once push_events accepts phone_app_opened (docs/phone-api.md §4). Until then the
 * server would reject the type and the queue would dead-letter it, so nothing is sent.
 */
export const PHONE_APP_OPENED_ACCEPTED = false;

export function trackPhoneApp(app: PhoneApp): void {
  if (PHONE_APP_OPENED_ACCEPTED) track('phone_app_opened' as never, { app } as never);
}
