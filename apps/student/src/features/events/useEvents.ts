// Event state: what has arrived, what was chosen. Saved to IndexedDB, so a reload keeps the
// inbox and never replays an event. Money, health and sanity changes go through the game store.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { track } from '../../api/track';
import { idbStorage } from '../../game/storage';
import { useGame } from '../../game/useGame';
import { lifeApi } from '../life/life';
import type { LifeDelta } from '../life/types';
import { getEvent } from './data';
import { dueIds, resolveChoice } from './resolve';

export interface InboxItem {
  id: string;          // PhoneThread id
  read: boolean;
  choice?: string;     // set once answered
  delta?: LifeDelta;   // what the answer changed
}

export interface SuddenState {
  id: string;
  hit: LifeDelta;      // what the event itself did (health −30, …)
  choice?: string;
  delta?: LifeDelta;
}

interface EventsStore {
  steps: number;
  fired: string[];
  inbox: InboxItem[];            // newest first
  sudden: SuddenState | null;
  notify: string | null;         // thread id to show as a banner (not saved)
  /** One step of play (a map visit or an action); delivers whatever is now due. */
  tick: () => void;
  /** Delivers an event now, scheduled or not (demo panel, ?event=). */
  trigger: (id: string) => void;
  answerThread: (id: string, choiceId: string) => void;
  chooseSudden: (choiceId: string) => void;
  closeSudden: () => void;
  markRead: (id: string) => void;
  dismissNotify: () => void;
}

const addOnce = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

const event = (id: string, choiceId: string, month: number, week: number) =>
  track('event_triggered', { eventId: id, choiceId, month, week });

export const useEvents = create<EventsStore>()(
  persist(
    (set, get) => {
      const deliver = (id: string) => {
        const ev = getEvent(id);
        if (!ev) return;
        const s = get();
        if (ev.kind === 'sudden') {
          if (s.sudden) return; // one at a time
          const game = useGame.getState();
          const out = lifeApi.applyEffects(game.life, ev.hit, 'all');
          game.apply(out);
          set({ sudden: { id, hit: out.delta }, fired: addOnce(s.fired, id) });
        } else {
          // A repeat (demo) replaces the old thread with a fresh, unanswered one.
          set({ inbox: [{ id, read: false }, ...s.inbox.filter((m) => m.id !== id)], notify: id, fired: addOnce(s.fired, id) });
        }
      };

      return {
        steps: 0,
        fired: [],
        inbox: [],
        sudden: null,
        notify: null,
        tick: () => {
          const steps = get().steps + 1;
          set({ steps });
          dueIds(steps, get().fired).forEach(deliver);
        },
        trigger: deliver,
        answerThread: (id, choiceId) => {
          const ev = getEvent(id);
          const item = get().inbox.find((m) => m.id === id);
          if (!ev || ev.kind !== 'phone' || !item || item.choice) return;
          const game = useGame.getState();
          const out = resolveChoice(game.life, ev, choiceId);
          if (!out || out.blocked) return;
          game.apply(out);
          event(id, choiceId, game.life.month, game.life.week);
          set((s) => ({
            inbox: s.inbox.map((m) => (m.id === id ? { ...m, read: true, choice: choiceId, delta: out.delta } : m)),
          }));
        },
        chooseSudden: (choiceId) => {
          const cur = get().sudden;
          const ev = cur && getEvent(cur.id);
          if (!cur || !ev || cur.choice) return;
          const game = useGame.getState();
          const out = resolveChoice(game.life, ev, choiceId);
          if (!out || out.blocked) return;
          game.apply(out);
          event(cur.id, choiceId, game.life.month, game.life.week);
          set({ sudden: { ...cur, choice: choiceId, delta: out.delta } });
        },
        closeSudden: () => {
          if (get().sudden?.choice) set({ sudden: null });
        },
        markRead: (id) => set((s) => ({ inbox: s.inbox.map((m) => (m.id === id ? { ...m, read: true } : m)) })),
        dismissNotify: () => set({ notify: null }),
      };
    },
    {
      name: 'paisa.events',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ steps: s.steps, fired: s.fired, inbox: s.inbox, sudden: s.sudden }),
    },
  ),
);

/** Demo panel hook (CLAUDE.md 9): fires an event right now, e.g. 'event.injury.01' or 'phone.otp.01'. */
export function triggerEvent(id: string): void {
  useEvents.getState().trigger(id);
}
