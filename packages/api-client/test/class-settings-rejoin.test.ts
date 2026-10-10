import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, createApiClient, isRetryableError, toApiError } from '../src';

type Res = { data: unknown; error: unknown; status?: number };

/** rpc, plus from(table).update().eq().select() and from(table).select().eq().order(). */
function fakeSupabase(rpc: (fn: string, args: unknown) => Res, table: Res = { data: [], error: null }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['update', 'eq', 'select', 'order']) {
    chain[op] = vi.fn((...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    });
  }
  chain.then = (resolve: (r: Res) => unknown) => resolve(table);
  const from = vi.fn(() => chain);
  const sb = { rpc: vi.fn(async (fn: string, args: unknown) => rpc(fn, args)), from };
  return { sb: sb as unknown as SupabaseClient, rpc: sb.rpc, from, calls };
}

const api = (f: ReturnType<typeof fakeSupabase>) => createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
const joined = { anon_id: 'a', class_id: 'c', default_lang: 'hi', endline_open: false, rejoin_code: 'ABC234' };

describe('rejoinClass', () => {
  it('calls rejoin_class with the frozen argument names and returns the student', async () => {
    const f = fakeSupabase(() => ({ data: joined, error: null }));
    expect(await api(f).rejoinClass('HYD234', 'Asha', 'abc234')).toEqual(joined);
    expect(f.rpc).toHaveBeenCalledWith('rejoin_class', { class_code: 'HYD234', nickname: 'Asha', rejoin_code: 'abc234' });
  });

  it('maps the 404 body to rejoin_failed, not retryable', async () => {
    const f = fakeSupabase(() => ({
      data: null,
      error: { code: 'PT404', message: 'rejoin_failed', details: null, hint: null },
      status: 404,
    }));
    const err = await api(f)
      .rejoinClass('HYD234', 'Asha', 'WRONG1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'rejoin_failed', status: 404 });
    expect(isRetryableError(err)).toBe(false);
  });

  it('still throws rejoin_failed if the error body ever arrives as data', async () => {
    const f = fakeSupabase(() => ({ data: { code: 'PT404', message: 'rejoin_failed' }, error: null, status: 200 }));
    await expect(api(f).rejoinClass('HYD234', 'Asha', 'WRONG1')).rejects.toMatchObject({ code: 'rejoin_failed' });
  });

  it('maps the failure throttle to join_rate_limited (retryable)', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { code: 'PT429', message: 'join_rate_limited' }, status: 429 }));
    const err = await api(f)
      .rejoinClass('HYD234', 'Asha', 'ABC234')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'join_rate_limited', status: 429 });
    expect(isRetryableError(err)).toBe(true);
  });

  it('knows rejoin_failed as a code', () => {
    expect(toApiError({ message: 'rejoin_failed', code: 'PT404' })).toMatchObject({ code: 'rejoin_failed', status: 404 });
  });
});

describe('classStatus', () => {
  it('calls class_status with anon_id and class_id', async () => {
    const status = { endline_open: true, default_lang: 'en', rejoin_code: 'ABC234' };
    const f = fakeSupabase(() => ({ data: status, error: null }));
    expect(await api(f).classStatus('a', 'c')).toEqual(status);
    expect(f.rpc).toHaveBeenCalledWith('class_status', { anon_id: 'a', class_id: 'c' });
  });

  it('maps a wrong pair to class_not_found', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { code: 'PT404', message: 'class_not_found' }, status: 404 }));
    await expect(api(f).classStatus('a', 'c')).rejects.toMatchObject({ code: 'class_not_found', status: 404 });
  });
});

describe('staff: end-line gate and rejoin codes', () => {
  it('setEndlineOpen updates endline_open on that class', async () => {
    const f = fakeSupabase(() => ({ data: null, error: null }), { data: [{ id: 'cls-1' }], error: null });
    await api(f).setEndlineOpen('cls-1', true);
    expect(f.from).toHaveBeenCalledWith('classes');
    expect(f.calls).toEqual([
      { op: 'update', args: [{ endline_open: true }] },
      { op: 'eq', args: ['id', 'cls-1'] },
      { op: 'select', args: ['id'] },
    ]);
  });

  it('setEndlineOpen reports class_not_found when no row was updated', async () => {
    const f = fakeSupabase(() => ({ data: null, error: null }), { data: [], error: null });
    await expect(api(f).setEndlineOpen('cls-1', false)).rejects.toMatchObject({ code: 'class_not_found' });
  });

  it('listStudents reads anon_id, nickname and rejoin_code for the class', async () => {
    const rows = [{ anon_id: 'a', nickname: 'Asha', rejoin_code: 'ABC234' }];
    const f = fakeSupabase(() => ({ data: null, error: null }), { data: rows, error: null });
    expect(await api(f).listStudents('cls-1')).toEqual(rows);
    expect(f.from).toHaveBeenCalledWith('students');
    expect(f.calls).toEqual([
      { op: 'select', args: ['anon_id, nickname, rejoin_code'] },
      { op: 'eq', args: ['class_id', 'cls-1'] },
      { op: 'order', args: ['nickname'] },
    ]);
  });

  it('listStudents maps errors', async () => {
    const f = fakeSupabase(() => ({ data: null, error: null }), {
      data: null,
      error: { message: 'TypeError: Failed to fetch' },
    });
    await expect(api(f).listStudents('cls-1')).rejects.toMatchObject({ code: 'network' });
  });

  it('resetRejoinCode calls reset_rejoin_code and returns the new code', async () => {
    const f = fakeSupabase(() => ({ data: 'XYZ789', error: null }));
    expect(await api(f).resetRejoinCode('a')).toBe('XYZ789');
    expect(f.rpc).toHaveBeenCalledWith('reset_rejoin_code', { anon_id: 'a' });
  });

  it('resetRejoinCode maps a refusal to class_not_found', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { code: 'PT404', message: 'class_not_found' }, status: 404 }));
    await expect(api(f).resetRejoinCode('a')).rejects.toMatchObject({ code: 'class_not_found', status: 404 });
  });
});
