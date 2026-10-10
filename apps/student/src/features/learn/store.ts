// What the student has learned: concepts met and understood, guides finished, and every lesson
// seen (the Notebook). Saved to IndexedDB on the phone only; the server sees just guide_completed.
// The rules are pure functions (tested in learn.test.ts); the store wraps them.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Pillar } from '@paisa/shared';
import { idbStorage } from '../../game/storage';

/** Where a lesson came from, which also says which string table holds its key. */
export type NoteSource = 'event' | 'guide' | 'classroom';

export interface Note {
  /** The lesson or explanation key, without "t:". */
  key: string;
  source: NoteSource;
  concept: string | null;
  pillar: Pillar | null;
  /** ISO time it was first seen. */
  at: string;
}

export interface GuideRecord {
  /** The first answer to the guide's check question. */
  correct: boolean;
  at: string;
}

export interface LearningState {
  /** Concept id to the ISO time it was first met. */
  met: Record<string, string>;
  /** Concept id to the ISO time it was first answered right. */
  understood: Record<string, string>;
  guides: Record<string, GuideRecord>;
  /** Newest first, one per lesson key. */
  notes: Note[];
}

export type ConceptState = 'new' | 'met' | 'understood';

export const emptyLearning = (): LearningState => ({ met: {}, understood: {}, guides: {}, notes: [] });

const stamp = (map: Record<string, string>, ids: (string | null)[], at: string): Record<string, string> => {
  const fresh = ids.filter((id): id is string => !!id && !(id in map));
  return fresh.length === 0 ? map : { ...map, ...Object.fromEntries(fresh.map((id) => [id, at])) };
};

/** Marks concepts as met. The first time counts; inputs are never mutated. */
export function meet(s: LearningState, concepts: (string | null)[], at: string): LearningState {
  const met = stamp(s.met, concepts, at);
  return met === s.met ? s : { ...s, met };
}

/** Marks concepts as understood (and met). */
export function understand(s: LearningState, concepts: (string | null)[], at: string): LearningState {
  const next = meet(s, concepts, at);
  const understood = stamp(next.understood, concepts, at);
  return understood === next.understood ? next : { ...next, understood };
}

/** Adds a lesson to the Notebook once; seeing it again keeps the first entry. */
export function addNote(s: LearningState, note: Note): LearningState {
  return s.notes.some((n) => n.key === note.key) ? s : { ...s, notes: [note, ...s.notes] };
}

/**
 * Records a finished guide. The first answer counts, like the classroom: a re-read never changes it.
 * Its concepts are met, and understood when the check was answered right.
 */
export function finishGuide(
  s: LearningState,
  guide: { id: string; concepts: string[] },
  correct: boolean,
  at: string,
): LearningState {
  if (s.guides[guide.id]) return s;
  const next = { ...s, guides: { ...s.guides, [guide.id]: { correct, at } } };
  return correct ? understand(next, guide.concepts, at) : meet(next, guide.concepts, at);
}

export function conceptState(s: LearningState, id: string): ConceptState {
  return id in s.understood ? 'understood' : id in s.met ? 'met' : 'new';
}

interface LearningStore extends LearningState {
  /** Applies one of the rules above with the current time. */
  update: (fn: (s: LearningState, at: string) => LearningState) => void;
}

export const useLearning = create<LearningStore>()(
  persist(
    (set, get) => ({
      ...emptyLearning(),
      update: (fn) => {
        const { met, understood, guides, notes } = get();
        const before: LearningState = { met, understood, guides, notes };
        const after = fn(before, new Date().toISOString());
        if (after !== before) set(after);
      },
    }),
    {
      name: 'paisa.learning',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ met: s.met, understood: s.understood, guides: s.guides, notes: s.notes }),
    },
  ),
);

/** For code outside React (the events store, the classroom's onFinish). */
export const learn = (fn: (s: LearningState, at: string) => LearningState) => useLearning.getState().update(fn);
