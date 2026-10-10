// What the sync banner says and when (CLAUDE.md 6: status as a banner, not a screen). Pure, so
// it is tested in node; OfflineBanner.tsx only renders it and runs the timers.

export type BannerKind = 'offline' | 'waiting' | 'synced';

/** The slice of the useSync store the banner reads. */
export interface SyncSnapshot {
  online: boolean;
  pending: number;
  failed: boolean;
  lastSyncedAt: string | null;
}

/** Carried between updates: whether the banner was showing a problem, and the last send time then. */
export interface BannerMemory {
  troubled: boolean;
  syncedAtStart: string | null;
}

export const FRESH: BannerMemory = { troubled: false, syncedAtStart: null };

/**
 * One update. `show` is the banner to display now, or null for nothing. 'synced' comes once,
 * when a send cleared the backlog after a problem; the caller keeps it up for a few seconds.
 * 'waiting' needs the phone online: offline it is just 'offline', as the cause is known.
 */
export function nextBanner(mem: BannerMemory, s: SyncSnapshot): { show: BannerKind | null; mem: BannerMemory } {
  if (!s.online) return { show: 'offline', mem: troubled(mem, s) };
  if (s.pending > 0 && s.failed) return { show: 'waiting', mem: troubled(mem, s) };
  if (!mem.troubled) return { show: null, mem };
  if (s.pending > 0) return { show: null, mem }; // sending right now: wait for the result
  const delivered = s.lastSyncedAt !== mem.syncedAtStart;
  return { show: delivered ? 'synced' : null, mem: FRESH };
}

const troubled = (mem: BannerMemory, s: SyncSnapshot): BannerMemory =>
  mem.troubled ? mem : { troubled: true, syncedAtStart: s.lastSyncedAt };
