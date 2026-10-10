import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@paisa/api-client';
import type { ApiErrorCode } from '@paisa/api-client';
import { JoinError, joinClass, rejoinClass, toJoinError } from './joinClass';
import type { JoinErrorCode } from './joinClass';

const backend = vi.hoisted(() => ({
  configured: true,
  api: null as null | { joinClass: ReturnType<typeof vi.fn>; rejoinClass: ReturnType<typeof vi.fn> },
}));
vi.mock('./backend', () => ({
  get backendConfigured() {
    return backend.configured;
  },
  loadApi: () => Promise.resolve(backend.api),
}));

const SERVER = {
  anon_id: '11111111-1111-4111-8111-111111111111',
  class_id: '22222222-2222-4222-8222-222222222222',
  default_lang: 'hi',
  endline_open: true,
  rejoin_code: 'K7M2PQ',
};

beforeEach(() => {
  backend.configured = true;
  backend.api = { joinClass: vi.fn().mockResolvedValue(SERVER), rejoinClass: vi.fn().mockResolvedValue(SERVER) };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('toJoinError', () => {
  // Every code the api-client can throw, and what onboarding explains for it.
  const MAP: Record<ApiErrorCode, JoinErrorCode> = {
    class_not_found: 'class_not_found',
    class_full: 'class_full',
    class_closed: 'class_closed',
    join_rate_limited: 'rate_limited',
    nickname_taken: 'nickname_taken',
    nickname_blocked: 'nickname_blocked',
    nickname_invalid: 'nickname_invalid',
    nickname_personal_info: 'nickname_personal_info',
    rejoin_failed: 'rejoin_failed',
    too_many_events: 'unknown',
    not_signed_in: 'unknown',
    auth_code_invalid: 'unknown',
    auth_rate_limited: 'unknown',
    auth_not_invited: 'unknown',
    network: 'offline',
    timeout: 'offline',
    unknown: 'unknown',
  };

  it.each(Object.entries(MAP))('%s becomes %s', (api, expected) => {
    const err = toJoinError(new ApiError(api as ApiErrorCode));
    expect(err).toBeInstanceOf(JoinError);
    expect(err.code).toBe(expected);
    expect(err.suggestions).toEqual([]);
  });

  it('carries the free nicknames the server suggests for nickname_taken', () => {
    const err = toJoinError(new ApiError('nickname_taken', undefined, 409, ['Tiger2', 'Tiger3']));
    expect(err.code).toBe('nickname_taken');
    expect(err.suggestions).toEqual(['Tiger2', 'Tiger3']);
    expect(toJoinError(new ApiError('nickname_taken')).suggestions).toEqual([]); // server sent no list
  });

  it('treats anything that is not an ApiError (chunk failed to load, fetch threw) as offline', () => {
    expect(toJoinError(new TypeError('Failed to fetch')).code).toBe('offline');
    expect(toJoinError('boom').code).toBe('offline');
    expect(toJoinError(undefined).code).toBe('offline');
  });

  it('passes a JoinError through unchanged', () => {
    const e = new JoinError('class_closed');
    expect(toJoinError(e)).toBe(e);
  });
});

describe('joinClass', () => {
  it('sends the code, nickname and chosen language, and keeps the rejoin code', async () => {
    const r = await joinClass('AB12CD34', 'Tiger7', 'hi');
    expect(backend.api!.joinClass).toHaveBeenCalledWith('AB12CD34', 'Tiger7', { lang: 'hi' });
    expect(r).toEqual(SERVER);
    expect(r.offline).toBeUndefined();
  });

  it('sends no language option when none was picked, and fills missing fields from an older server', async () => {
    backend.api!.joinClass.mockResolvedValue({ anon_id: SERVER.anon_id, class_id: SERVER.class_id, default_lang: 'en' });
    const r = await joinClass('AB12CD34', 'Tiger7');
    expect(backend.api!.joinClass).toHaveBeenCalledWith('AB12CD34', 'Tiger7', undefined);
    expect(r).toMatchObject({ endline_open: false, rejoin_code: null });
  });

  it('throws a JoinError with the suggestions when the nickname is taken', async () => {
    backend.api!.joinClass.mockRejectedValue(new ApiError('nickname_taken', undefined, 409, ['Tiger2']));
    await expect(joinClass('AB12CD34', 'Tiger')).rejects.toMatchObject({ name: 'JoinError', code: 'nickname_taken', suggestions: ['Tiger2'] });
  });

  it('throws offline when the request cannot reach the server', async () => {
    backend.api!.joinClass.mockRejectedValue(new ApiError('network', 'Failed to fetch'));
    await expect(joinClass('AB12CD34', 'Tiger')).rejects.toMatchObject({ code: 'offline' });
  });

  it('uses an offline stand-in when no backend is configured', async () => {
    vi.useFakeTimers();
    backend.configured = false;
    backend.api = null;
    const pending = joinClass('AB12CD34', 'Tiger');
    await vi.advanceTimersByTimeAsync(300);
    const r = await pending;
    expect(r).toMatchObject({ default_lang: 'en', endline_open: false, rejoin_code: null, offline: true });
    expect(r.anon_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.class_id).not.toBe(r.anon_id);
  });

  it('the stand-in still refuses an empty code or nickname', async () => {
    vi.useFakeTimers();
    backend.configured = false;
    const noCode = joinClass(' ', 'Tiger');
    const noName = joinClass('AB12CD34', ' ');
    const results = Promise.allSettled([noCode, noName]);
    await vi.advanceTimersByTimeAsync(300);
    const [a, b] = await results;
    expect(a).toMatchObject({ status: 'rejected', reason: { code: 'class_not_found' } });
    expect(b).toMatchObject({ status: 'rejected', reason: { code: 'nickname_invalid' } });
  });
});

describe('rejoinClass', () => {
  it('maps the server result', async () => {
    const r = await rejoinClass('AB12CD34', 'Tiger7', 'k7m2pq');
    expect(backend.api!.rejoinClass).toHaveBeenCalledWith('AB12CD34', 'Tiger7', 'k7m2pq');
    expect(r).toMatchObject({ anon_id: SERVER.anon_id, endline_open: true, rejoin_code: 'K7M2PQ' });
  });

  it('keeps the typed code, tidied, when the server does not echo one', async () => {
    backend.api!.rejoinClass.mockResolvedValue({ anon_id: SERVER.anon_id, class_id: SERVER.class_id, default_lang: 'en' });
    const r = await rejoinClass('AB12CD34', 'Tiger7', ' k7m2pq ');
    expect(r.rejoin_code).toBe('K7M2PQ');
  });

  it('says rejoin_failed for any wrong part', async () => {
    backend.api!.rejoinClass.mockRejectedValue(new ApiError('rejoin_failed', undefined, 404));
    await expect(rejoinClass('AB12CD34', 'Tiger7', 'AAAAAA')).rejects.toMatchObject({ code: 'rejoin_failed' });
  });

  it('needs the server: with no backend it is offline, not a stand-in', async () => {
    backend.configured = false;
    backend.api = null;
    await expect(rejoinClass('AB12CD34', 'Tiger7', 'K7M2PQ')).rejects.toMatchObject({ code: 'offline' });
  });
});
