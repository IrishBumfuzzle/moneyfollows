// The dashboard API on sample data, in memory (sample mode, src/mode.ts). Any email and any
// password sign in. Changes last until the tab reloads; nothing leaves the browser.
import { ApiError, type ClassRow } from '@paisa/api-client';
import type { Lang } from '@paisa/shared';
import type { DashboardApi } from '../types';
import {
  buildSampleSchool,
  learningGainOf,
  makeCode,
  seededRng,
  SAMPLE_FACILITATOR_ID,
  studentRowsOf,
  type SampleClass,
} from './sampleData';

const SESSION_KEY = 'paisa.dashboard.sample-email';
export const SAMPLE_EMAIL = 'sample.facilitator@example.org';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readEmail(storage: Storage | undefined): string | null {
  try {
    return storage?.getItem(SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeEmail(storage: Storage | undefined, email: string | null) {
  try {
    if (email) storage?.setItem(SESSION_KEY, email);
    else storage?.removeItem(SESSION_KEY);
  } catch {
    // storage blocked: the sign-in lasts until the tab reloads
  }
}

export interface SampleApiOptions {
  now?: Date;
  /** A short pause on every call, so loading states show as they would online. 0 in tests. */
  delayMs?: number;
  /** Keeps the sample sign-in across a reload (sessionStorage in the browser). */
  storage?: Storage;
}

export function createSampleApi({ now = new Date(), delayMs = 250, storage }: SampleApiOptions = {}): DashboardApi {
  const school: SampleClass[] = buildSampleSchool(now);
  const rng = seededRng(now.getTime() % 2 ** 31);
  const listeners = new Set<(email: string | null) => void>();
  let email = readEmail(storage);
  let created = 0;

  const pause = <T>(value: T): Promise<T> =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(() => resolve(value), delayMs)) : Promise.resolve(value);

  function setEmail(next: string | null) {
    email = next;
    writeEmail(storage, next);
    for (const cb of listeners) cb(next);
  }

  function find(classId: string): SampleClass {
    const found = school.find((c) => c.cls.id === classId);
    if (!found) throw new ApiError('class_not_found', undefined, 404);
    return found;
  }

  function signedIn() {
    if (!email) throw new ApiError('not_signed_in', undefined, 401);
  }

  /** Runs `fn` after the pause; a thrown ApiError rejects the promise like a failed request. */
  const call = <T>(fn: () => T): Promise<T> =>
    pause(undefined).then(() => {
      signedIn();
      return fn();
    });

  return {
    async signInWithPassword(address: string) {
      await pause(undefined);
      setEmail(address.trim().toLowerCase() || SAMPLE_EMAIL);
    },

    async signUpWithPassword(address: string) {
      await pause(undefined);
      setEmail(address.trim().toLowerCase() || SAMPLE_EMAIL);
      return { signedIn: true };
    },

    /** No email leaves sample mode, so there is never a link to open. */
    sendPasswordReset: () => pause(undefined),

    async verifyPasswordReset() {
      await pause(undefined);
      throw new ApiError('auth_link_invalid');
    },

    setPassword: () => call(() => undefined),

    async signOut() {
      setEmail(null);
    },

    currentEmail: () => Promise.resolve(email),

    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    isStaff: () => pause(true),

    listClasses: () => call(() => school.map((c) => ({ ...c.cls }))),

    createClass: (name: string, defaultLang: Lang) =>
      call(() => {
        created += 1;
        const cls: ClassRow = {
          id: `sample-new-${created}`,
          class_code: makeCode(rng, 8),
          default_lang: defaultLang,
          facilitator_id: SAMPLE_FACILITATOR_ID,
          name,
          created_at: new Date().toISOString(),
          join_open: true,
          endline_open: false,
        };
        school.unshift({ cls, students: [], classroom: [] });
        return { ...cls };
      }),

    setJoinOpen: (classId: string, open: boolean) =>
      call(() => {
        find(classId).cls.join_open = open;
      }),

    setEndlineOpen: (classId: string, open: boolean) =>
      call(() => {
        find(classId).cls.endline_open = open;
      }),

    rotateClassCode: (classId: string) =>
      call(() => {
        const c = find(classId);
        c.cls.class_code = makeCode(rng, 8);
        return c.cls.class_code;
      }),

    listStudents: (classId: string) => call(() => studentRowsOf(find(classId).students)),

    resetRejoinCode: (anonId: string) =>
      call(() => {
        const student = school.flatMap((c) => c.students).find((s) => s.row.anon_id === anonId);
        if (!student) throw new ApiError('unknown', 'student not found', 404);
        student.rejoin_code = makeCode(rng, 6);
        return student.rejoin_code;
      }),

    classProgress: (classId: string) =>
      call(() => find(classId).students.map((s) => ({ ...s.row, pillars: { ...s.row.pillars } }))),

    learningGain: (classId: string) => call(() => learningGainOf(find(classId).students)),

    classroomQuizSummary: (classId: string) => call(() => find(classId).classroom.map((r) => ({ ...r }))),
  };
}
