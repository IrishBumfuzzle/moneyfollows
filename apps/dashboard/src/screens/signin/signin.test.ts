import { describe, expect, it } from 'vitest';
import { ApiError } from '@paisa/api-client';
import {
  CODE_INPUT_MAX,
  RESEND_SECONDS,
  cleanOtp,
  isCompleteOtp,
  isValidEmail,
  normalizeEmail,
  secondsLeft,
  signInErrorKey,
} from './signin';

describe('email', () => {
  it('accepts ordinary addresses and rejects typos', () => {
    expect(isValidEmail(' teacher@ngo.org ')).toBe(true);
    for (const bad of ['', 'teacher', 'teacher@', '@ngo.org', 'a b@ngo.org', 'a@b'])
      expect(isValidEmail(bad), bad).toBe(false);
  });

  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Teacher@NGO.org ')).toBe('teacher@ngo.org');
  });
});

describe('cleanOtp', () => {
  it('keeps digits only and at most six', () => {
    expect(cleanOtp('123 456')).toBe('123456');
    expect(cleanOtp('12a-34')).toBe('1234');
    expect(cleanOtp('1234567890')).toBe('123456');
  });

  it('the code box is long enough to take a pasted "123 456" whole (a browser cuts a paste at maxLength)', () => {
    for (const pasted of ['123 456', ' 123 456', '123-456']) {
      expect(pasted.length, pasted).toBeLessThanOrEqual(CODE_INPUT_MAX);
      expect(cleanOtp(pasted.slice(0, CODE_INPUT_MAX)), pasted).toBe('123456');
    }
  });

  it('is complete at exactly six digits', () => {
    expect(isCompleteOtp('12345')).toBe(false);
    expect(isCompleteOtp('123456')).toBe(true);
  });
});

describe('secondsLeft', () => {
  it('counts down from the cooldown and stops at zero', () => {
    expect(secondsLeft(1000, 1000)).toBe(RESEND_SECONDS);
    expect(secondsLeft(1000, 1000 + 1)).toBe(RESEND_SECONDS);
    expect(secondsLeft(1000, 1000 + 30_000)).toBe(30);
    expect(secondsLeft(1000, 1000 + 59_001)).toBe(1);
    expect(secondsLeft(1000, 1000 + 60_000)).toBe(0);
    expect(secondsLeft(1000, 1000 + 600_000)).toBe(0);
  });

  it('is zero when no code was ever sent (sentAt 0)', () => {
    expect(secondsLeft(0, Date.now())).toBe(0);
  });
});

describe('signInErrorKey', () => {
  it('maps each auth failure to its message', () => {
    expect(signInErrorKey(new ApiError('auth_not_invited'))).toBe('signin.err.not_invited');
    expect(signInErrorKey(new ApiError('auth_code_invalid'))).toBe('signin.err.code_invalid');
    expect(signInErrorKey(new ApiError('auth_rate_limited'))).toBe('signin.err.rate_limited');
    expect(signInErrorKey(new ApiError('network'))).toBe('signin.err.network');
    expect(signInErrorKey(new ApiError('timeout'))).toBe('signin.err.network');
    expect(signInErrorKey(new ApiError('unknown', 'boom'))).toBe('signin.err.unknown');
  });

  it('explains a failed demo sign-in differently from a wrong code', () => {
    expect(signInErrorKey(new ApiError('auth_code_invalid'), true)).toBe('signin.err.demo');
  });

  it('survives values that are not ApiErrors', () => {
    expect(signInErrorKey(new Error('x'))).toBe('signin.err.unknown');
    expect(signInErrorKey(undefined)).toBe('signin.err.unknown');
  });
});
