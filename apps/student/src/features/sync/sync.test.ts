import { describe, expect, it } from 'vitest';
import { FRESH, nextBanner } from './banner';
import type { BannerMemory, SyncSnapshot } from './banner';
import { STRINGS, t } from './content';

const ONLINE: SyncSnapshot = { online: true, pending: 0, failed: false, lastSyncedAt: null };
const at = (n: number) => `2026-10-11T02:00:0${n}.000Z`;

/** Feeds a sequence of store snapshots through the banner and returns what it showed each time. */
function run(steps: SyncSnapshot[]): (string | null)[] {
  let mem: BannerMemory = FRESH;
  return steps.map((s) => {
    const r = nextBanner(mem, s);
    mem = r.mem;
    return r.show;
  });
}

describe('nextBanner', () => {
  it('says nothing while online with nothing wrong, even with events waiting for their turn', () => {
    expect(run([ONLINE, { ...ONLINE, pending: 3 }, { ...ONLINE, lastSyncedAt: at(1) }])).toEqual([null, null, null]);
  });

  it('says offline as soon as the phone is offline', () => {
    expect(run([ONLINE, { ...ONLINE, online: false }, { ...ONLINE, online: false, pending: 2 }])).toEqual([null, 'offline', 'offline']);
  });

  it('says "All synced" once after a send clears what piled up offline', () => {
    const off = { ...ONLINE, online: false, pending: 2 };
    expect(
      run([
        off,
        { ...ONLINE, pending: 2 }, // back online, sending
        { ...ONLINE, pending: 0, lastSyncedAt: at(1) }, // delivered
        { ...ONLINE, pending: 0, lastSyncedAt: at(1) }, // nothing more to say
      ]),
    ).toEqual(['offline', null, 'synced', null]);
  });

  it('says nothing after an offline spell with nothing to send', () => {
    expect(run([{ ...ONLINE, online: false }, ONLINE, ONLINE])).toEqual(['offline', null, null]);
  });

  it('says how many are waiting when sending keeps failing while online, then "All synced"', () => {
    const stuck = { ...ONLINE, pending: 4, failed: true };
    expect(run([stuck, stuck, { ...ONLINE, lastSyncedAt: at(2) }])).toEqual(['waiting', 'waiting', 'synced']);
  });

  it('does not say "All synced" for a send that happened before the trouble began', () => {
    const was = { ...ONLINE, lastSyncedAt: at(1) };
    expect(run([was, { ...was, online: false }, { ...was }])).toEqual([null, 'offline', null]);
  });

  it('offline wins over waiting: the cause is known', () => {
    expect(run([{ ...ONLINE, online: false, pending: 1, failed: true }])).toEqual(['offline']);
  });
});

describe('sync banner content (CLAUDE.md 7.2: every key in en and hi)', () => {
  it('en and hi have the same keys and no empty strings', () => {
    expect(Object.keys(STRINGS.hi!).sort()).toEqual(Object.keys(STRINGS.en!).sort());
    for (const lang of ['en', 'hi'] as const) {
      for (const [k, v] of Object.entries(STRINGS[lang]!)) expect(v.trim(), `${lang} ${k}`).not.toBe('');
    }
  });

  it('keeps the same placeholders in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(STRINGS.en!)) expect(vars(STRINGS.hi![k]!), k).toEqual(vars(v));
  });

  it('says offline onboarding needs internet and does not claim anything is saved', () => {
    expect(t('en', 'sync.offline.join')).toContain('internet');
    expect(t('en', 'sync.offline.join')).not.toContain('saved');
    expect(t('hi', 'sync.offline.join')).toContain('इंटरनेट');
  });

  it('fills in the count', () => {
    expect(t('en', 'sync.waiting.many', { count: 12 })).toBe('12 updates waiting to send');
    expect(t('hi', 'sync.waiting.short', { count: 12 })).toContain('12');
  });
});
