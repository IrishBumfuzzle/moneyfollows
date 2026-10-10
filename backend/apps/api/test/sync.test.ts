import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SyncResult, type SyncEvent } from '@paisa/contracts';
import { schema } from '@paisa/db';
import { bearer, join, seedOrg, setup, type Harness } from './helpers';

describe('POST /v1/sync', () => {
  let h: Harness;
  let me: { token: string; anonId: string };
  let other: { token: string; anonId: string };
  beforeAll(async () => {
    h = await setup();
    const { cls } = await seedOrg(h.db);
    const a = await join(h, cls.classCode, 'Offline One');
    const b = await join(h, cls.classCode, 'Offline Two');
    me = { token: a.token, anonId: a.profile.anonId };
    other = { token: b.token, anonId: b.profile.anonId };
  });
  afterAll(() => h.close());

  const ev = (profileId: string, seq: number, type: SyncEvent['type'], payload: Record<string, unknown> = {}): SyncEvent => ({
    eventId: randomUUID(),
    profileId,
    type,
    occurredAt: new Date(Date.UTC(2026, 9, 9, 8, 0, seq)).toISOString(),
    seq,
    payload,
  });
  const sync = (token: string, events: SyncEvent[]) =>
    h.app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(token), payload: { events } });

  it('accepts a batch, and a retry of the same batch adds nothing', async () => {
    const batch = [
      ev(me.anonId, 1, 'app_open'),
      ev(me.anonId, 2, 'decision_made', { scenarioId: 'budget.recharge.01', choiceId: 'b', pillar: 'plan_budget' }),
      ev(me.anonId, 3, 'rewind_used', { scenarioId: 'budget.recharge.01', choiceId: 'b' }),
      ev(me.anonId, 4, 'decision_made', { scenarioId: 'budget.recharge.01', choiceId: 'a', pillar: 'plan_budget' }),
      ev(me.anonId, 5, 'badge_earned', { badgeId: 'scam_spotter' }),
    ];
    const first = SyncResult.parse((await sync(me.token, batch)).json());
    expect(first.accepted.sort()).toEqual(batch.map((e) => e.eventId).sort());
    const retry = SyncResult.parse((await sync(me.token, batch)).json());
    expect(retry.accepted.sort()).toEqual(first.accepted.sort());

    const stored = await h.db.select().from(schema.events).where(eq(schema.events.profileId, me.anonId));
    expect(stored.length).toBe(5);
    const decisions = await h.db.select().from(schema.decisionEvents).where(eq(schema.decisionEvents.profileId, me.anonId));
    expect(decisions.map((d) => [d.choiceId, d.rewound]).sort()).toEqual([
      ['a', false],
      ['b', true],
    ]);
    const rewards = await h.db.select().from(schema.rewards).where(eq(schema.rewards.profileId, me.anonId));
    expect(rewards.map((r) => r.badgeId)).toEqual(['scam_spotter']);

    const [profile] = await h.db.select().from(schema.studentProfiles).where(eq(schema.studentProfiles.anonId, me.anonId));
    expect(profile!.lastActiveAt?.toISOString()).toBe(h.clock.now.toISOString());
  });

  it("rejects events for a profile the token does not cover, and ids another profile already used", async () => {
    const mine = ev(me.anonId, 10, 'app_open');
    const theirs = ev(other.anonId, 1, 'app_open');
    const res = SyncResult.parse((await sync(me.token, [mine, theirs])).json());
    expect(res.accepted).toEqual([mine.eventId]);
    expect(res.rejected).toEqual([theirs.eventId]);

    const stolen = { ...ev(other.anonId, 2, 'app_open'), eventId: mine.eventId };
    const res2 = SyncResult.parse((await sync(other.token, [stolen])).json());
    expect(res2).toEqual({ accepted: [], rejected: [mine.eventId] });
  });

  it('validates the batch', async () => {
    expect((await sync(me.token, [])).statusCode).toBe(400);
    const tooMany = Array.from({ length: 501 }, (_, i) => ev(me.anonId, i, 'app_open'));
    expect((await sync(me.token, tooMany)).statusCode).toBe(400);
    const bad = { ...ev(me.anonId, 1, 'app_open'), type: 'hack' };
    expect((await h.app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(me.token), payload: { events: [bad] } })).statusCode).toBe(400);
  });
});
