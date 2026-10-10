// Start-of-term (baseline) and end-of-term (end-line) checks: which one to offer, and a saved
// "done" record so a student is never offered the same check twice. The server keeps only the
// first attempt per type (quiz_attempts, first one wins), so the first score counts here too.
// The quiz_submitted event itself is sent by the app from onFinish, not from this file.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from '../../game/storage';
import type { QuizKind } from './types';

export type AssessmentKind = 'baseline' | 'endline';

export interface AssessmentRecord {
  /** 0–100, as sent in quiz_submitted. */
  score: number;
  /** ISO time it was finished. */
  at: string;
}

export type Assessments = Partial<Record<AssessmentKind, AssessmentRecord>>;

/** The assessment a quiz kind stands for, or null for the classroom practice quiz. */
export function assessmentKind(kind: QuizKind): AssessmentKind | null {
  return kind === 'baseline' || kind === 'endline' ? kind : null;
}

/**
 * Which check the intro should offer first: the start-of-term check until it is done, then the
 * end-of-term check once the teacher has opened it (class_status.endline_open), else none.
 */
export function nextAssessment(done: Assessments, endlineOpen: boolean): AssessmentKind | null {
  if (!done.baseline) return 'baseline';
  if (endlineOpen && !done.endline) return 'endline';
  return null;
}

/** Adds a finished check. The first one per kind wins (like the server), so a repeat changes nothing. */
export function recordAssessment(done: Assessments, kind: AssessmentKind, score: number, at: string): Assessments {
  if (done[kind]) return done;
  return { ...done, [kind]: { score, at } };
}

/** Strings key + vars for the encouraging line under the result. Never shames a low score. */
export function resultNote(kind: AssessmentKind, score: number, before?: number): { key: string; vars: Record<string, number> } {
  if (kind === 'baseline') return { key: 'classroom.assess.note.baseline', vars: {} };
  if (before === undefined) return { key: 'classroom.assess.note.endline.none', vars: {} };
  const trend = score > before ? 'up' : score === before ? 'same' : 'down';
  return { key: `classroom.assess.note.endline.${trend}`, vars: { before } };
}

interface AssessmentStore {
  done: Assessments;
  /** Saves a finished check; the first score per kind counts. */
  record: (kind: AssessmentKind, score: number, at?: string) => void;
  /** Forgets both checks (profile reset, demo panel). Never in normal play. */
  reset: () => void;
}

export const useAssessments = create<AssessmentStore>()(
  persist(
    (set) => ({
      done: {},
      record: (kind, score, at = new Date().toISOString()) =>
        set((s) => {
          const done = recordAssessment(s.done, kind, score, at);
          return done === s.done ? s : { done };
        }),
      reset: () => set({ done: {} }),
    }),
    { name: 'paisa.assessments', version: 1, storage: createJSONStorage(() => idbStorage) },
  ),
);

/**
 * True once the saved record has been read from IndexedDB. This store is not in the app's
 * hydration gate, so the intro waits on this instead of offering a check that is already done.
 */
export function useAssessmentsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAssessments.persist.hasHydrated());
  useEffect(() => {
    if (useAssessments.persist.hasHydrated()) return setHydrated(true);
    return useAssessments.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
