import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JoinResponse } from '@paisa/contracts';
import { bearer, join, seedOrg, setup, type Harness } from './helpers';

describe('student join and profile', () => {
  let h: Harness;
  let classCode: string;
  beforeAll(async () => {
    h = await setup();
    classCode = (await seedOrg(h.db)).cls.classCode;
  });
  afterAll(() => h.close());

  it('joins with a class code and nickname and gets a device token', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/join', payload: { classCode: classCode.toLowerCase(), nickname: 'Chai Star' } });
    expect(res.statusCode).toBe(200);
    const body = JoinResponse.parse(res.json());
    expect(body.profile).toMatchObject({ nickname: 'Chai Star', language: 'hi', level: 1 });
    expect(body.defaultLanguage).toBe('hi');

    const me = await h.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(body.token) });
    expect(me.json()).toEqual(body.profile);
  });

  it('rejects an unknown code, a taken nickname, abuse and personal info', async () => {
    const bad = (payload: object) => h.app.inject({ method: 'POST', url: '/v1/join', payload });
    expect((await bad({ classCode: 'ZZZZZZ', nickname: 'Asha' })).statusCode).toBe(404);
    expect((await bad({ classCode, nickname: 'chai star' })).json().error).toBe('nickname_taken');
    expect((await bad({ classCode, nickname: 'G4n du' })).json().error).toBe('blocked_word');
    expect((await bad({ classCode, nickname: 'chutiya' })).json().error).toBe('blocked_word');
    expect((await bad({ classCode, nickname: 'Asha 98765 43210' })).json().error).toBe('personal_info');
    expect((await bad({ classCode, nickname: 'x' })).statusCode).toBe(400);
  });

  it('refuses a class whose programme has ended', async () => {
    const { schema } = await import('@paisa/db');
    const { eq } = await import('drizzle-orm');
    const other = await seedOrg(h.db);
    await h.db.update(schema.classes).set({ programmeEndsAt: new Date('2026-01-01') }).where(eq(schema.classes.id, other.cls.id));
    const res = await h.app.inject({ method: 'POST', url: '/v1/join', payload: { classCode: other.cls.classCode, nickname: 'Late' } });
    expect(res.statusCode).toBe(410);
  });

  it('updates language and level', async () => {
    const { token } = await join(h, classCode, 'Ravi Fan');
    const res = await h.app.inject({ method: 'PATCH', url: '/v1/me', headers: bearer(token), payload: { language: 'en', level: 2 } });
    expect(res.json()).toMatchObject({ language: 'en', level: 2 });
  });

  it('needs a valid student token', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
    expect((await h.app.inject({ method: 'GET', url: '/v1/me', headers: bearer('nope.nope.nope') })).statusCode).toBe(401);
  });
});
