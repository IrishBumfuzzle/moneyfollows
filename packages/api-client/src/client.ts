import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SYNC_BATCH_MAX,
  type ClassProgressRow,
  type ClassStatus,
  type JoinClassResult,
  type Lang,
  type LearningGainRow,
  type SyncEvent,
} from '@paisa/shared';
import { ApiError, toApiError } from './errors';
import type { PushEventsResponse } from './sync-queue';
import type { ClassroomQuizSummaryRow, ClassWellbeingRow } from '@paisa/shared';

export interface ClassRow {
  id: string;
  class_code: string;
  default_lang: Lang;
  facilitator_id: string;
  name: string;
  created_at: string;
  /** false: join_class refuses new students with class_closed (setJoinOpen). */
  join_open: boolean;
  /** true: students may take the end-line quiz (setEndlineOpen; students read it with classStatus). */
  endline_open: boolean;
}

/** listStudents: what a teacher needs to read a student their rejoin code. */
export interface StudentRow {
  anon_id: string;
  nickname: string;
  rejoin_code: string;
}

/** learning_gain row plus the additive `n`: matched students for that pillar (= baseline_n = endline_n). */
export type MatchedLearningGainRow = LearningGainRow & { n: number };

export interface ApiClientOptions {
  url: string;
  anonKey: string;
  /** Inject a client (tests, or an app that already has one). */
  supabase?: SupabaseClient;
}

/**
 * The only way apps talk to the backend (CLAUDE.md 6). Students use joinClass and
 * pushEvents with the anon key and never sign in; staff sign in with an email code.
 */
export function createApiClient(options: ApiClientOptions) {
  const sb = options.supabase ?? createClient(options.url, options.anonKey);

  async function rpc<T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    let res;
    try {
      const query = sb.rpc(fn, args);
      res = await (signal ? query.abortSignal(signal) : query);
    } catch (err) {
      const message = (err as Error).message;
      throw new ApiError(signal?.aborted ? 'timeout' : 'network', message);
    }
    if (res.error) throw toApiError(res.error, res.status);
    return res.data as T;
  }

  /** Updates one of the facilitator's own classes; RLS hides the rest, so no row means class_not_found. */
  async function updateClass(classId: string, patch: Partial<Pick<ClassRow, 'join_open' | 'endline_open'>>) {
    const { data, error } = await sb.from('classes').update(patch).eq('id', classId).select('id');
    if (error) throw toApiError(error);
    if (!data?.length) throw new ApiError('class_not_found', undefined, 404);
  }

  return {
    supabase: sb,

    // ---- Students (5.5) ----
    /**
     * `opts.lang` is the language picked in onboarding, saved as the student's; without it (or
     * with an unknown one) the class default is used. `default_lang` in the result is always the
     * class's. On nickname_taken, the ApiError's `suggestions` lists up to 3 free nicknames.
     */
    joinClass(classCode: string, nickname: string, opts?: { lang?: Lang }): Promise<JoinClassResult> {
      const args: Record<string, unknown> = { class_code: classCode, nickname };
      if (opts?.lang !== undefined) args.lang = opts.lang;
      return rpc<JoinClassResult>('join_class', args);
    },

    /**
     * Gets an existing student back on a new or reset phone (works even in a closed class).
     * Any wrong part gives rejoin_failed, never saying which; repeated failures in a class give
     * join_rate_limited for a few minutes.
     */
    async rejoinClass(classCode: string, nickname: string, rejoinCode: string): Promise<JoinClassResult> {
      const res = await rpc<JoinClassResult | { message?: string }>('rejoin_class', {
        class_code: classCode,
        nickname,
        rejoin_code: rejoinCode,
      });
      // The server returns rejoin_failed as a 404 body (so the failure is recorded); should a
      // proxy ever pass it through as a 200, it is still an error.
      if (!res || !('anon_id' in res)) throw new ApiError('rejoin_failed', undefined, 404);
      return res;
    },

    /** `signal` aborts the request (the sync queue uses it for its timeout). */
    pushEvents(events: SyncEvent[], signal?: AbortSignal): Promise<PushEventsResponse> {
      if (events.length > SYNC_BATCH_MAX) throw new ApiError('too_many_events');
      return rpc<PushEventsResponse>('push_events', { events }, signal);
    },

    /** The class settings for a joined student (end-line gate, language, current rejoin code). */
    classStatus(anonId: string, classId: string): Promise<ClassStatus> {
      return rpc<ClassStatus>('class_status', { anon_id: anonId, class_id: classId });
    },

    // ---- Staff (dashboard) ----
    /**
     * Sends a sign-in code. Staff accounts are invited by an admin (sign-up is off in
     * supabase/config.toml) and must be on the staff allowlist to see any class.
     */
    async signInWithEmail(email: string): Promise<void> {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) throw toApiError(error);
    },

    async verifyEmailCode(email: string, token: string): Promise<void> {
      const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw toApiError(error);
    },

    async signOut(): Promise<void> {
      await sb.auth.signOut();
    },

    async listClasses(): Promise<ClassRow[]> {
      const { data, error } = await sb.from('classes').select('*').order('created_at', { ascending: false });
      if (error) throw toApiError(error);
      return data as ClassRow[];
    },

    /** The class code is generated by the database; show it as text and a QR code. */
    async createClass(name: string, defaultLang: Lang): Promise<ClassRow> {
      const { data, error } = await sb.from('classes').insert({ name, default_lang: defaultLang }).select('*').single();
      if (error) throw toApiError(error);
      return data as ClassRow;
    },

    async renameStudent(anonId: string, nickname: string): Promise<void> {
      const { error } = await sb.from('students').update({ nickname }).eq('anon_id', anonId);
      if (error) throw toApiError(error);
    },

    /** Closes (false) or reopens (true) a class to new joins. Students already in it keep playing. */
    setJoinOpen(classId: string, open: boolean): Promise<void> {
      return updateClass(classId, { join_open: open });
    },

    /**
     * A fresh code for a leaked one; returns it. The old code stops working for new joins.
     * Students who already joined keep syncing (they hold class_id, not the code).
     */
    rotateClassCode(classId: string): Promise<string> {
      return rpc<string>('rotate_class_code', { class_id: classId });
    },

    /** Opens (true) or closes (false) the end-line quiz for the class. */
    setEndlineOpen(classId: string, open: boolean): Promise<void> {
      return updateClass(classId, { endline_open: open });
    },

    /** The class's students with their rejoin codes, so a teacher can read a code out. */
    async listStudents(classId: string): Promise<StudentRow[]> {
      const { data, error } = await sb
        .from('students')
        .select('anon_id, nickname, rejoin_code')
        .eq('class_id', classId)
        .order('nickname');
      if (error) throw toApiError(error);
      return data as StudentRow[];
    },

    /** A new rejoin code for a student (e.g. the old one was shared); returns it. */
    resetRejoinCode(anonId: string): Promise<string> {
      return rpc<string>('reset_rejoin_code', { anon_id: anonId });
    },

    classProgress(classId: string): Promise<ClassProgressRow[]> {
      return rpc<ClassProgressRow[]>('class_progress', { class_id: classId });
    },

    /** Matched students only (both quizzes); `n` is how many, per pillar. */
    async learningGain(classId: string): Promise<MatchedLearningGainRow[]> {
      const rows = await rpc<MatchedLearningGainRow[]>('learning_gain', { class_id: classId });
      // numeric columns arrive as strings from PostgREST.
      return rows.map((r) => ({
        ...r,
        baseline_avg: r.baseline_avg === null ? null : Number(r.baseline_avg),
        endline_avg: r.endline_avg === null ? null : Number(r.endline_avg),
      }));
    },

    /** One row per classroom question the class answered: where the class is struggling. */
    async classroomQuizSummary(classId: string): Promise<ClassroomQuizSummaryRow[]> {
      const rows = await rpc<ClassroomQuizSummaryRow[]>('classroom_quiz_summary', { class_id: classId });
      // numeric columns arrive as strings from PostgREST.
      return rows.map((r) => ({ ...r, correct_pct: Number(r.correct_pct) }));
    },

    /** Store purchases, want spending, work shifts and school days per student (life events). */
    classWellbeing(classId: string): Promise<ClassWellbeingRow[]> {
      return rpc<ClassWellbeingRow[]>('class_wellbeing', { class_id: classId });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
