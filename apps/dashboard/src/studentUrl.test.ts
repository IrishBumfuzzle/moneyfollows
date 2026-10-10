import { describe, expect, it } from 'vitest';
import { resolveStudentUrl } from './studentUrl';

describe('resolveStudentUrl', () => {
  it('uses the configured address and drops trailing slashes and spaces', () => {
    expect(resolveStudentUrl('https://play.example.org/', false)).toBe('https://play.example.org');
    expect(resolveStudentUrl(' https://play.example.org// ', true)).toBe('https://play.example.org');
  });

  it('falls back to localhost only in a dev server', () => {
    expect(resolveStudentUrl(undefined, true)).toBe('http://localhost:5173');
    expect(resolveStudentUrl('', true)).toBe('http://localhost:5173');
  });

  it('has no address in a production build without one, so join links stay switched off', () => {
    expect(resolveStudentUrl(undefined, false)).toBe('');
    expect(resolveStudentUrl('', false)).toBe('');
    expect(resolveStudentUrl('   ', false)).toBe('');
  });
});
