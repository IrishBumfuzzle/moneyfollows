import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@paisa/api-client';
import type { Profile } from '../features/onboarding/types';
import { refreshClassStatus, seedClassStatus, useClassStatus } from './classStatus';

const backend = vi.hoisted(() => ({
  configured: true,
  online: true,
  api: { classStatus: vi.fn() },
  loadApi: vi.fn(),
}));
vi.mock('./backend', () => ({
  get backendConfigured() {
    return backend.configured;
  },
  isOnline: () => backend.online,
  loadApi: backend.loadApi,
}));
const saveProfile = vi.hoisted(() => vi.fn());
vi.mock('../features/onboarding/profile', () => ({ saveProfile }));

const PROFILE: Profile = {
  version: 1,
  nickname: 'Tiger7',
  avatar: 'tiger',
  persona: 'sana',
  lang: 'hi',
  classCode: 'AB12CD34',
  classId: '22222222-2222-4222-8222-222222222222',
  anonId: '11111111-1111-4111-8111-111111111111',
  rejoinCode: 'K7M2PQ',
};

beforeEach(() => {
  backend.configured = true;
  backend.online = true;
  backend.api.classStatus.mockReset().mockResolvedValue({ endline_open: false, default_lang: 'en', rejoin_code: 'K7M2PQ' });
  backend.loadApi.mockReset().mockImplementation(() => Promise.resolve(backend.api));
  saveProfile.mockReset().mockResolvedValue(undefined);
  useClassStatus.setState({ endlineOpen: null });
});

describe('refreshClassStatus', () => {
  it('asks the server about this student and stores whether the end-line is open', async () => {
    backend.api.classStatus.mockResolvedValue({ endline_open: true, default_lang: 'en', rejoin_code: 'K7M2PQ' });
    expect(await refreshClassStatus(PROFILE)).toBe('ok');
    expect(backend.api.classStatus).toHaveBeenCalledWith(PROFILE.anonId, PROFILE.classId);
    expect(useClassStatus.getState().endlineOpen).toBe(true);

    backend.api.classStatus.mockResolvedValue({ endline_open: false, default_lang: 'en', rejoin_code: 'K7M2PQ' });
    await refreshClassStatus(PROFILE);
    expect(useClassStatus.getState().endlineOpen).toBe(false); // the teacher closed it again
  });

  it('saves a changed end-line gate to the profile, so an offline start keeps it', async () => {
    backend.api.classStatus.mockResolvedValue({ endline_open: true, default_lang: 'en', rejoin_code: 'K7M2PQ' });
    const onProfile = vi.fn();
    await refreshClassStatus(PROFILE, onProfile);
    const open = { ...PROFILE, endlineOpen: true };
    expect(saveProfile).toHaveBeenCalledWith(open);
    expect(onProfile).toHaveBeenCalledWith(open);

    saveProfile.mockClear();
    onProfile.mockClear();
    await refreshClassStatus(open, onProfile); // unchanged: no write
    expect(saveProfile).not.toHaveBeenCalled();
    expect(onProfile).not.toHaveBeenCalled();

    backend.api.classStatus.mockResolvedValue({ endline_open: false, default_lang: 'en', rejoin_code: 'K7M2PQ' });
    await refreshClassStatus(open, onProfile); // the teacher closed it again
    expect(saveProfile).toHaveBeenCalledWith({ ...PROFILE, endlineOpen: false });
  });

  it('does not write the profile for a closed gate it never knew about (closed is the default)', async () => {
    await refreshClassStatus(PROFILE); // server says closed, same rejoin code
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('saves a new code and a changed gate in one write', async () => {
    backend.api.classStatus.mockResolvedValue({ endline_open: true, default_lang: 'en', rejoin_code: 'NEW234' });
    await refreshClassStatus(PROFILE);
    expect(saveProfile).toHaveBeenCalledOnce();
    expect(saveProfile).toHaveBeenCalledWith({ ...PROFILE, rejoinCode: 'NEW234', endlineOpen: true });
  });

  it('runs one request at a time per student: a second trigger is skipped, a later one runs', async () => {
    let answer!: (s: unknown) => void;
    backend.api.classStatus.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const first = refreshClassStatus(PROFILE);
    await vi.waitFor(() => expect(backend.api.classStatus).toHaveBeenCalledOnce());
    expect(await refreshClassStatus(PROFILE)).toBe('skipped'); // e.g. foreground and Classroom together
    expect(backend.api.classStatus).toHaveBeenCalledOnce();
    answer({ endline_open: true, default_lang: 'en', rejoin_code: 'K7M2PQ' });
    expect(await first).toBe('ok');
    expect(useClassStatus.getState().endlineOpen).toBe(true);

    expect(await refreshClassStatus(PROFILE)).toBe('ok'); // finished: the next one goes through
    expect(backend.api.classStatus).toHaveBeenCalledTimes(2);
  });

  it('lets the next trigger through after a failed request', async () => {
    backend.api.classStatus.mockRejectedValueOnce(new ApiError('network', 'Failed to fetch'));
    expect(await refreshClassStatus(PROFILE)).toBe('skipped');
    expect(await refreshClassStatus(PROFILE)).toBe('ok');
  });

  it('saves a new rejoin code (the teacher reset it) and hands the profile on', async () => {
    backend.api.classStatus.mockResolvedValue({ endline_open: false, default_lang: 'en', rejoin_code: 'NEW234' });
    const onProfile = vi.fn();
    expect(await refreshClassStatus(PROFILE, onProfile)).toBe('ok');
    const updated = { ...PROFILE, rejoinCode: 'NEW234' };
    expect(saveProfile).toHaveBeenCalledWith(updated);
    expect(onProfile).toHaveBeenCalledWith(updated);
  });

  it('saves the code for a profile that has none yet', async () => {
    const { rejoinCode: _, ...noCode } = PROFILE;
    const onProfile = vi.fn();
    await refreshClassStatus(noCode, onProfile);
    expect(onProfile).toHaveBeenCalledWith({ ...noCode, rejoinCode: 'K7M2PQ' });
  });

  it('still shows the new code when saving it fails (private mode)', async () => {
    backend.api.classStatus.mockResolvedValue({ endline_open: false, default_lang: 'en', rejoin_code: 'NEW234' });
    saveProfile.mockRejectedValue(new Error('IndexedDB unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onProfile = vi.fn();
    expect(await refreshClassStatus(PROFILE, onProfile)).toBe('ok');
    expect(onProfile).toHaveBeenCalledOnce();
  });

  it('is stale when the server does not know this phone (a stand-in or another backend)', async () => {
    backend.api.classStatus.mockRejectedValue(new ApiError('class_not_found', undefined, 404));
    useClassStatus.setState({ endlineOpen: true });
    expect(await refreshClassStatus(PROFILE)).toBe('stale');
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['a network error', new ApiError('network', 'Failed to fetch')],
    ['a timeout', new ApiError('timeout')],
    ['a server error', new ApiError('unknown', 'boom', 500)],
    ['the client chunk failing to load', new TypeError('Failed to fetch dynamically imported module')],
  ])('leaves everything as it is on %s', async (_name, err) => {
    backend.api.classStatus.mockRejectedValue(err);
    const onProfile = vi.fn();
    expect(await refreshClassStatus(PROFILE, onProfile)).toBe('skipped');
    expect(onProfile).not.toHaveBeenCalled();
    expect(useClassStatus.getState().endlineOpen).toBeNull();
  });

  it('does nothing offline, with no backend, or when the client is unavailable', async () => {
    backend.online = false;
    expect(await refreshClassStatus(PROFILE)).toBe('skipped');
    backend.online = true;
    backend.configured = false;
    expect(await refreshClassStatus(PROFILE)).toBe('skipped');
    backend.configured = true;
    backend.loadApi.mockResolvedValue(null);
    expect(await refreshClassStatus(PROFILE)).toBe('skipped');
    expect(backend.api.classStatus).not.toHaveBeenCalled();
  });
});

describe('seedClassStatus', () => {
  it('starts the gate from the saved answer while the server has not answered', () => {
    seedClassStatus(true);
    expect(useClassStatus.getState().endlineOpen).toBe(true);
  });

  it('never overwrites a server answer, and ignores a profile with no saved answer', () => {
    useClassStatus.setState({ endlineOpen: false });
    seedClassStatus(true);
    expect(useClassStatus.getState().endlineOpen).toBe(false);

    useClassStatus.setState({ endlineOpen: null });
    seedClassStatus(undefined);
    expect(useClassStatus.getState().endlineOpen).toBeNull();
  });
});
