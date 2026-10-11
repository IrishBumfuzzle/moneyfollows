import { describe, expect, it } from 'vitest';
import { readResetToken, withoutResetToken } from './resetLink';

describe('reset link', () => {
  it('reads the token hash from ?reset=', () => {
    expect(readResetToken('?reset=pkce_abc123')).toBe('pkce_abc123');
    expect(readResetToken('?demo=1&reset=abc')).toBe('abc');
    expect(readResetToken('')).toBeNull();
    expect(readResetToken('?reset=')).toBeNull();
    expect(readResetToken('?reset=%20')).toBeNull();
  });

  it('removes only the token from the address', () => {
    expect(withoutResetToken('https://dash.example.org/?reset=abc')).toBe('/');
    expect(withoutResetToken('http://127.0.0.1:5174/?reset=abc&demo=1#/class/x/progress')).toBe(
      '/?demo=1#/class/x/progress',
    );
  });
});
