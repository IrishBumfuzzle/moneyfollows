// Which save the app plays (CLAUDE.md 9). A normal launch uses the default IndexedDB store. With
// ?demo=1 every save (game stores, profile, sync queue) lives in a separate database, so a demo
// can never overwrite a real student's save, and a reload keeps the demo. ?demo=1&reset=1
// starts the demo fresh. The stores wait for saveReady() before their first read, so the seed
// is always in place first.
import { clear, createStore, get, setMany } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import { demoEntries, demoNickname, demoOptions, demoProfile, withoutReset, DEMO_CLASS_CODE } from './seed';

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const DEMO = params.get('demo') === '1';

/** The idb-keyval store for saves: undefined (the default store) unless in demo mode. */
export const saveStore: UseStore | undefined = DEMO ? createStore('paisa-demo', 'keyval') : undefined;

const JOIN_TIMEOUT_MS = 4000;

/** Joins HYD234 for real when there is a backend and a network, else an offline stand-in. */
async function demoIds(): Promise<{ anonId: string; classId: string; nickname: string; rejoinCode?: string | null }> {
  const nickname = demoNickname(Math.random() * 10000);
  const { joinClass, uuid } = await import('../../api/joinClass');
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), JOIN_TIMEOUT_MS));
    const r = await Promise.race([joinClass(DEMO_CLASS_CODE, nickname), timeout]);
    return { anonId: r.anon_id, classId: r.class_id, nickname, rejoinCode: r.rejoin_code };
  } catch (err) {
    console.warn('[demo] could not join', DEMO_CLASS_CODE, '- playing with an offline stand-in', err);
    return { anonId: uuid(), classId: uuid(), nickname };
  }
}

async function seed(store: UseStore): Promise<void> {
  try {
    const reset = params.get('reset') === '1';
    if (reset) await clear(store);
    if (!reset && (await get('paisa.profile', store))) return; // a reload: keep playing the demo
    const o = demoOptions(params, import.meta.env.VITE_SHOW_DRAFT_LANGS === 'true');
    await setMany(demoEntries(demoProfile(o, await demoIds())), store);
    if (reset) window.history.replaceState(window.history.state, '', withoutReset(window.location.href));
  } catch (err) {
    console.warn('[demo] could not seed the demo save', err);
  }
}

const ready: Promise<void> = saveStore ? seed(saveStore) : Promise.resolve();

/** Resolves once the demo seed (if any) is written. Every save read waits for it. */
export const saveReady = (): Promise<void> => ready;
