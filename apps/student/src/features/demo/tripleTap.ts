// Counts quick taps for the hidden demo panel's secret gesture. Pure, so it is tested in node.

export const TAP_WINDOW_MS = 600;

/** Taps so far: `count` taps, the last at `at` (ms). */
export interface Taps {
  count: number;
  at: number;
}

export const NO_TAPS: Taps = { count: 0, at: -Infinity };

/** One tap at `now`. `fire` is true on the third tap in a row, each within TAP_WINDOW_MS of the last. */
export function tap(prev: Taps, now: number, needed = 3): { taps: Taps; fire: boolean } {
  const count = now - prev.at <= TAP_WINDOW_MS ? prev.count + 1 : 1;
  if (count >= needed) return { taps: NO_TAPS, fire: true };
  return { taps: { count, at: now }, fire: false };
}
