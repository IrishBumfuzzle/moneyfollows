import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, createApiClient } from '../src';

function fakeSupabase(rpc: (fn: string, args: unknown) => unknown) {
  return { rpc: vi.fn(async (fn: string, args: unknown) => rpc(fn, args)) } as unknown as SupabaseClient & {
    rpc: ReturnType<typeof vi.fn>;
  };
}

const CLASS = '5a2e9c3b-4f1d-4c8a-a6e2-1b9d8c7f6e54';

describe('dashboard data (api-client)', () => {
  it('classroomQuizSummary calls classroom_quiz_summary and turns correct_pct into a number', async () => {
    const sb = fakeSupabase(() => ({
      // PostgREST sends numeric columns as strings.
      data: [
        {
          question_id: 'q.plan',
          pillar: 'plan_budget',
          attempts: 4,
          students: 2,
          correct_pct: '75.0',
          top_wrong_choice: 1,
        },
        {
          question_id: 'q.safe',
          pillar: 'stay_safe',
          attempts: 3,
          students: 2,
          correct_pct: '0.0',
          top_wrong_choice: null,
        },
      ],
      error: null,
    }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    expect(await api.classroomQuizSummary(CLASS)).toEqual([
      { question_id: 'q.plan', pillar: 'plan_budget', attempts: 4, students: 2, correct_pct: 75, top_wrong_choice: 1 },
      { question_id: 'q.safe', pillar: 'stay_safe', attempts: 3, students: 2, correct_pct: 0, top_wrong_choice: null },
    ]);
    expect(sb.rpc).toHaveBeenCalledWith('classroom_quiz_summary', { class_id: CLASS });
  });

  it('classWellbeing calls class_wellbeing and passes the rows through', async () => {
    const row = {
      anon_id: '0b1d7c8e-1e7b-4d55-8f62-7d0c4a9f3e21',
      nickname: 'Asha',
      necessity_purchases: 1,
      want_purchases: 2,
      want_spend: 650,
      work_shifts: 2,
      school_days: 1,
    };
    const sb = fakeSupabase(() => ({ data: [row], error: null }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    expect(await api.classWellbeing(CLASS)).toEqual([row]);
    expect(sb.rpc).toHaveBeenCalledWith('class_wellbeing', { class_id: CLASS });
  });

  it('classProgress passes the new persona and classroom_best columns through', async () => {
    const row = {
      anon_id: 'a',
      nickname: 'Asha',
      modules_done: 0,
      last_active: null,
      lang: 'hi',
      decisions: 0,
      pillars: { plan_budget: 0, save_manage: 0, understand_investing: 0, stay_safe: 0 },
      baseline_score: null,
      endline_score: null,
      weeks_played: 0,
      news_editions: 0,
      persona: 'sana',
      classroom_best: 80,
    };
    const sb = fakeSupabase(() => ({ data: [row], error: null }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    expect(await api.classProgress(CLASS)).toEqual([row]);
  });

  it('turns a server error into an ApiError', async () => {
    const sb = fakeSupabase(() => ({
      data: null,
      error: { message: 'permission denied for function class_wellbeing', code: '42501' },
      status: 401,
    }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: sb });
    await expect(api.classWellbeing(CLASS)).rejects.toBeInstanceOf(ApiError);
    await expect(api.classroomQuizSummary(CLASS)).rejects.toMatchObject({ code: 'unknown', status: 401 });
  });
});
