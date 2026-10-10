import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { SyncBatch, SyncResult } from '@paisa/contracts';
import { schema, type Db } from '@paisa/db';
import { insertEvents, touchProfile } from '../event-store';
import { route } from '../http';

export async function syncRoutes(app: FastifyInstance, { db }: { db: Db }) {
  route(
    app,
    {
      method: 'POST',
      url: '/v1/sync',
      summary: 'Upload queued offline events. Idempotent on eventId, so retries are safe',
      tag: 'sync',
      auth: 'student',
      body: SyncBatch,
      response: SyncResult,
    },
    async ({ student, body }) => {
      const mine = body.events.filter((e) => e.profileId === student.sub);
      const rejected = body.events.filter((e) => e.profileId !== student.sub).map((e) => e.eventId);
      if (mine.length === 0) return { accepted: [], rejected };

      const [profile] = await db
        .select({ classId: schema.studentProfiles.classId })
        .from(schema.studentProfiles)
        .where(eq(schema.studentProfiles.anonId, student.sub));
      if (!profile) return { accepted: [], rejected: body.events.map((e) => e.eventId) };

      await db.transaction(async (tx) => {
        await insertEvents(
          tx,
          mine.map((e) => ({
            eventId: e.eventId,
            profileId: e.profileId,
            classId: profile.classId,
            type: e.type,
            occurredAt: new Date(e.occurredAt),
            seq: e.seq,
            payload: e.payload,
            source: 'client' as const,
          })),
        );
        await touchProfile(tx, [student.sub], app.now());
      });

      // Accepted = everything we now hold for this profile, new or duplicate.
      const held = await db
        .select({ eventId: schema.events.eventId, profileId: schema.events.profileId })
        .from(schema.events)
        .where(inArray(schema.events.eventId, mine.map((e) => e.eventId)));
      const accepted = held.filter((h) => h.profileId === student.sub).map((h) => h.eventId);
      // An id already used by another profile is not this device's event.
      const clash = mine.map((e) => e.eventId).filter((id) => !accepted.includes(id));
      return { accepted, rejected: [...rejected, ...clash] };
    },
  );
}
