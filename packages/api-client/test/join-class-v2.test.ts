import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, createApiClient, isRetryableError, toApiError } from '../src';

type Res = { data: unknown; error: unknown; status?: number };

function fakeSupabase(rpc: (fn: string, args: unknown) => Res, update?: Res) {
  const select = vi.fn(async () => update ?? { data: [], error: null });
  const eq = vi.fn(() => ({ select }));
  const updateFn = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update: updateFn }));
  const sb = { rpc: vi.fn(async (fn: string, args: unknown) => rpc(fn, args)), from };
  return { sb: sb as unknown as SupabaseClient, rpc: sb.rpc, from, update: updateFn, eq, select };
}

const joined = { anon_id: 'a', class_id: 'c', default_lang: 'hi' };

describe('joinClass v2', () => {
  it('sends lang only when given, so 2-argument calls are unchanged', async () => {
    const f = fakeSupabase(() => ({ data: joined, error: null }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
    expect(await api.joinClass('ABC234', 'Asha')).toEqual(joined);
    expect(f.rpc).toHaveBeenLastCalledWith('join_class', { class_code: 'ABC234', nickname: 'Asha' });
    await api.joinClass('ABC234', 'Asha', {});
    expect(f.rpc).toHaveBeenLastCalledWith('join_class', { class_code: 'ABC234', nickname: 'Asha' });
    await api.joinClass('ABC234', 'Asha', { lang: 'en' });
    expect(f.rpc).toHaveBeenLastCalledWith('join_class', { class_code: 'ABC234', nickname: 'Asha', lang: 'en' });
  });

  it('puts the server’s nickname suggestions on the ApiError', async () => {
    const f = fakeSupabase(() => ({
      data: null,
      error: { message: 'nickname_taken', code: 'PT409', details: '["Asha2","Asha3","Asha4"]' },
      status: 409,
    }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
    const err = await api.joinClass('ABC234', 'Asha').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'nickname_taken', status: 409, suggestions: ['Asha2', 'Asha3', 'Asha4'] });
  });

  it('maps class_closed to its own code (403, not retryable)', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { message: 'class_closed', code: 'PT403' }, status: 403 }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
    const err = await api.joinClass('ABC234', 'Asha').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'class_closed', status: 403 });
    expect((err as ApiError).suggestions).toBeUndefined();
    expect(isRetryableError(err)).toBe(false);
  });
});

describe('toApiError suggestions', () => {
  const taken = (details: unknown) => toApiError({ message: 'nickname_taken', code: 'PT409', details } as never);

  it('parses a JSON array of strings, including an empty one', () => {
    expect(taken('["सितारा2"]').suggestions).toEqual(['सितारा2']);
    expect(taken('[]').suggestions).toEqual([]);
  });

  it('gives undefined, never throws, for missing or malformed details', () => {
    for (const details of [undefined, null, '', 'not json', '{"a":1}', '"Asha2"', '[1,2]', '["ok",null]', 42]) {
      const err = taken(details);
      expect(err.code, String(details)).toBe('nickname_taken');
      expect(err.suggestions, String(details)).toBeUndefined();
    }
  });

  it('ignores details on other errors', () => {
    const err = toApiError({ message: 'class_full', code: 'PT403', details: '["x"]' });
    expect(err).toMatchObject({ code: 'class_full', status: 403 });
    expect(err.suggestions).toBeUndefined();
  });
});

describe('class admin', () => {
  it('rotateClassCode calls rotate_class_code and returns the new code', async () => {
    const f = fakeSupabase(() => ({ data: 'NEWCODE2', error: null }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
    expect(await api.rotateClassCode('cls-1')).toBe('NEWCODE2');
    expect(f.rpc).toHaveBeenCalledWith('rotate_class_code', { class_id: 'cls-1' });
  });

  it('rotateClassCode maps a refusal to class_not_found', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { message: 'class_not_found', code: 'PT404' }, status: 404 }));
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
    await expect(api.rotateClassCode('cls-1')).rejects.toMatchObject({ code: 'class_not_found', status: 404 });
  });

  it('setJoinOpen updates join_open on that class', async () => {
    const f = fakeSupabase(() => ({ data: null, error: null }), { data: [{ id: 'cls-1' }], error: null });
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
    await api.setJoinOpen('cls-1', false);
    expect(f.from).toHaveBeenCalledWith('classes');
    expect(f.update).toHaveBeenCalledWith({ join_open: false });
    expect(f.eq).toHaveBeenCalledWith('id', 'cls-1');
  });

  it('setJoinOpen reports class_not_found when no row was updated (not yours, or no such class)', async () => {
    const f = fakeSupabase(() => ({ data: null, error: null }), { data: [], error: null });
    const api = createApiClient({ url: 'http://x', anonKey: 'k', supabase: f.sb });
    await expect(api.setJoinOpen('cls-1', true)).rejects.toMatchObject({ code: 'class_not_found' });
  });
});
