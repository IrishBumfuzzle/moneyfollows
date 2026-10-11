import { describe, expect, it } from 'vitest';
import { ApiError } from '@paisa/api-client';
import { PASSWORD_MIN, isValidEmail, normalizeEmail, passwordProblem, resetRedirect, signInErrorKey } from './signin';

describe('email', () => {
  it('accepts ordinary addresses, Gmail included, and rejects typos', () => {
    expect(isValidEmail(' teacher@ngo.org ')).toBe(true);
    expect(isValidEmail('some.one+class11@gmail.com')).toBe(true);
    for (const bad of ['', 'teacher', 'teacher@', '@ngo.org', 'a b@ngo.org', 'a@b'])
      expect(isValidEmail(bad), bad).toBe(false);
  });

  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Teacher@Gmail.com ')).toBe('teacher@gmail.com');
  });
});

describe('passwordProblem', () => {
  it('needs something typed to sign in, whatever its length', () => {
    expect(passwordProblem('', false)).toBe('signin.err.password_empty');
    expect(passwordProblem('abc', false)).toBeNull();
  });

  it('needs the server minimum for a new password, and keeps spaces', () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(passwordProblem('', true)).toBe('signin.err.password_empty');
    expect(passwordProblem('1234567', true)).toBe('signin.err.password_short');
    expect(passwordProblem('12345678', true)).toBeNull();
    expect(passwordProblem('  pass  ', true)).toBeNull();
  });
});

describe('signInErrorKey', () => {
  it('maps each auth failure to its message', () => {
    const cases: [ApiError, string][] = [
      [new ApiError('auth_not_invited'), 'signin.err.not_invited'],
      [new ApiError('auth_wrong_password'), 'signin.err.wrong_password'],
      [new ApiError('auth_account_exists'), 'signin.err.account_exists'],
      [new ApiError('auth_weak_password'), 'signin.err.weak_password'],
      [new ApiError('auth_link_invalid'), 'signin.err.link_invalid'],
      [new ApiError('auth_email_invalid'), 'signin.err.email'],
      [new ApiError('auth_rate_limited'), 'signin.err.rate_limited'],
      [new ApiError('network'), 'signin.err.network'],
      [new ApiError('timeout'), 'signin.err.network'],
      [new ApiError('unknown', 'boom'), 'signin.err.unknown'],
    ];
    for (const [err, key] of cases) expect(signInErrorKey(err), err.code).toBe(key);
  });

  it('explains a failed demo sign-in differently from a wrong password', () => {
    expect(signInErrorKey(new ApiError('auth_wrong_password'), { demo: true })).toBe('signin.err.demo');
  });

  it('blames the email for an unexplained failure to send a reset link', () => {
    expect(signInErrorKey(new ApiError('unknown', 'Error sending recovery email', 500), { mode: 'forgot' })).toBe(
      'signin.err.send_failed',
    );
    expect(signInErrorKey(new ApiError('auth_rate_limited'), { mode: 'forgot' })).toBe('signin.err.rate_limited');
  });

  it('survives values that are not ApiErrors', () => {
    expect(signInErrorKey(new Error('x'))).toBe('signin.err.unknown');
    expect(signInErrorKey(undefined)).toBe('signin.err.unknown');
  });
});

describe('resetRedirect', () => {
  it('is this page without its query or hash', () => {
    expect(resetRedirect({ origin: 'https://dash.example.org', pathname: '/' })).toBe('https://dash.example.org/');
    expect(resetRedirect({ origin: 'http://127.0.0.1:5174', pathname: '/staff/' })).toBe(
      'http://127.0.0.1:5174/staff/',
    );
  });
});
