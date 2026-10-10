import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  DecisionMadePayload,
  RewindUsedPayload,
  type EventType,
  type GameEvent,
} from '@paisa/contracts';
import { schema, type Db, type Tx } from '@paisa/db';
import { randomUUID } from 'node:crypto';

export interface NewEvent {
  eventId: string;
  profileId: string;
  classId: string | null;
  type: EventType;
  occurredAt: Date;
  seq: number;
  payload: Record<string, unknown>;
  source: 'client' | 'server';
}

/**
 * Inserts events idempotently and updates the analytics projections for the
 * rows that were actually new. Returns the ids that were inserted.
 */
export async function insertEvents(db: Db | Tx, rows: NewEvent[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const inserted = await db
    .insert(schema.events)
    .values(rows)
    .onConflictDoNothing({ target: schema.events.eventId })
    .returning({ eventId: schema.events.eventId });
  const fresh = new Set(inserted.map((r) => r.eventId));
  // Project in order so a rewind finds the decision it undoes, even in the same batch.
  const ordered = rows.filter((r) => fresh.has(r.eventId)).sort((a, b) => a.seq - b.seq || +a.occurredAt - +b.occurredAt);
  for (const row of ordered) await project(db, row);
  return [...fresh];
}

async function project(db: Db | Tx, row: NewEvent): Promise<void> {
  if (row.type === 'decision_made') {
    const p = DecisionMadePayload.safeParse(row.payload);
    if (!p.success) return;
    await db
      .insert(schema.decisionEvents)
      .values({
        eventId: row.eventId,
        profileId: row.profileId,
        classId: row.classId,
        scenarioId: p.data.scenarioId,
        choiceId: p.data.choiceId,
        pillar: p.data.pillar ?? null,
        occurredAt: row.occurredAt,
      })
      .onConflictDoNothing();
  } else if (row.type === 'rewind_used') {
    const p = RewindUsedPayload.safeParse(row.payload);
    if (!p.success) return;
    const [last] = await db
      .select({ eventId: schema.decisionEvents.eventId })
      .from(schema.decisionEvents)
      .where(
        and(
          eq(schema.decisionEvents.profileId, row.profileId),
          eq(schema.decisionEvents.scenarioId, p.data.scenarioId),
          eq(schema.decisionEvents.choiceId, p.data.choiceId),
          eq(schema.decisionEvents.rewound, false),
        ),
      )
      .orderBy(desc(schema.decisionEvents.occurredAt))
      .limit(1);
    if (last) {
      await db.update(schema.decisionEvents).set({ rewound: true }).where(eq(schema.decisionEvents.eventId, last.eventId));
    }
  } else if (row.type === 'badge_earned') {
    const badgeId = row.payload['badgeId'];
    if (typeof badgeId !== 'string') return;
    await db.insert(schema.rewards).values({ profileId: row.profileId, badgeId, earnedAt: row.occurredAt }).onConflictDoNothing();
  }
}

/** Server-side events from the engine or a quiz, stamped with an id and the server time. */
export function serverEvents(
  events: GameEvent[],
  profile: { anonId: string; classId: string | null },
  now: Date,
  seqBase: number,
): NewEvent[] {
  return events.map((e, i) => ({
    eventId: randomUUID(),
    profileId: profile.anonId,
    classId: profile.classId,
    type: e.type,
    // Keep the batch in order without colliding timestamps.
    occurredAt: new Date(now.getTime() + i),
    seq: seqBase + i,
    payload: e.payload,
    source: 'server',
  }));
}

export async function touchProfile(db: Db | Tx, anonIds: string[], now: Date): Promise<void> {
  if (anonIds.length === 0) return;
  await db
    .update(schema.studentProfiles)
    .set({ lastActiveAt: sql`greatest(${schema.studentProfiles.lastActiveAt}, ${now.toISOString()}::timestamptz)` })
    .where(inArray(schema.studentProfiles.anonId, anonIds));
}
