import { describe, expect, it } from 'vitest';
import { hasAuthLinkError, hashFor, parseHash, routeKey } from './route';

const ID = '00000000-0000-4000-8000-00000000c001';

describe('parseHash', () => {
  it('treats empty and root hashes as the class list', () => {
    for (const h of ['', '#', '#/', '#/classes']) expect(parseHash(h)).toEqual({ name: 'classes' });
  });

  it('reads a class and its tab', () => {
    expect(parseHash(`#/class/${ID}/gains`)).toEqual({ name: 'class', id: ID, tab: 'gains' });
    expect(parseHash(`#/class/${ID}/settings`)).toEqual({ name: 'class', id: ID, tab: 'settings' });
    expect(parseHash(`#/class/${ID}/progress/`)).toEqual({ name: 'class', id: ID, tab: 'progress' });
  });

  it('opens Progress when the tab is missing or unknown', () => {
    expect(parseHash(`#/class/${ID}`)).toEqual({ name: 'class', id: ID, tab: 'progress' });
    expect(parseHash(`#/class/${ID}/nope`)).toEqual({ name: 'class', id: ID, tab: 'progress' });
  });

  it('falls back to the class list for anything malformed', () => {
    for (const h of [
      '#/class',
      '#/class//progress',
      '#/class/a b/progress',
      '#/class/%E0%A4/progress',
      `#/class/${ID}/gains/extra`,
      '#/other/1',
    ]) {
      expect(parseHash(h), h).toEqual({ name: 'classes' });
    }
  });

  it('ignores a supabase auth fragment', () => {
    expect(parseHash('#access_token=abc&refresh_token=def&type=invite')).toEqual({ name: 'classes' });
  });
});

describe('hashFor', () => {
  it('round-trips every route', () => {
    for (const tab of ['progress', 'gains', 'settings'] as const) {
      const route = { name: 'class', id: ID, tab } as const;
      expect(parseHash(hashFor(route))).toEqual(route);
    }
    expect(parseHash(hashFor({ name: 'classes' }))).toEqual({ name: 'classes' });
  });
});

describe('routeKey', () => {
  it('changes with the class and the tab', () => {
    const a = routeKey({ name: 'class', id: 'a', tab: 'progress' });
    expect(a).not.toBe(routeKey({ name: 'class', id: 'a', tab: 'gains' }));
    expect(a).not.toBe(routeKey({ name: 'class', id: 'b', tab: 'progress' }));
    expect(a).not.toBe(routeKey({ name: 'classes' }));
  });
});

describe('hasAuthLinkError', () => {
  it('spots an expired invite link', () => {
    expect(
      hasAuthLinkError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'),
    ).toBe(true);
  });

  it('is false for normal routes and a successful link', () => {
    expect(hasAuthLinkError('')).toBe(false);
    expect(hasAuthLinkError(`#/class/${ID}/progress`)).toBe(false);
    expect(hasAuthLinkError('#access_token=abc&type=invite')).toBe(false);
  });
});
