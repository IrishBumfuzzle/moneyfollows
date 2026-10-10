import { and, inArray, isNotNull, lte } from 'drizzle-orm';
import { schema, type Db } from '@paisa/db';

/**
 * Retention (B19): at each class's programme end, unlink its students from the
 * class. Profiles keep only anonymous play data; reports by class stop seeing them.
 * Returns how many profiles were unlinked.
 */
export async function unlinkEndedClasses(db: Db, now: Date): Promise<number> {
  const ended = await db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(and(isNotNull(schema.classes.programmeEndsAt), lte(schema.classes.programmeEndsAt, now)));
  if (ended.length === 0) return 0;
  const ids = ended.map((c) => c.id);
  return db.transaction(async (tx) => {
    const unlinked = await tx
      .update(schema.studentProfiles)
      .set({ classId: null })
      .where(inArray(schema.studentProfiles.classId, ids))
      .returning({ anonId: schema.studentProfiles.anonId });
    await tx.update(schema.events).set({ classId: null }).where(inArray(schema.events.classId, ids));
    await tx.update(schema.decisionEvents).set({ classId: null }).where(inArray(schema.decisionEvents.classId, ids));
    await tx.update(schema.quizAttempts).set({ classId: null }).where(inArray(schema.quizAttempts.classId, ids));
    return unlinked.length;
  });
}
