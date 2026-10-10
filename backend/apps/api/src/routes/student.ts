import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { JoinRequest, JoinResponse, StudentProfile, UpdateProfileRequest } from '@paisa/contracts';
import { schema, type Db } from '@paisa/db';
import { conflict, HttpError, notFound } from '../errors';
import { route } from '../http';
import { checkNickname } from '../nickname';
import { signToken, STUDENT_TTL_S } from '../tokens';

type ProfileRow = typeof schema.studentProfiles.$inferSelect;

export function toProfile(row: ProfileRow): StudentProfile {
  return {
    anonId: row.anonId,
    classId: row.classId,
    nickname: row.nickname,
    avatar: row.avatar,
    language: row.language,
    level: row.maturityLevel,
  };
}

export async function loadProfile(db: Db, anonId: string): Promise<ProfileRow> {
  const [row] = await db.select().from(schema.studentProfiles).where(eq(schema.studentProfiles.anonId, anonId));
  if (!row) throw notFound('profile');
  return row;
}

export async function studentRoutes(app: FastifyInstance, { db }: { db: Db }) {
  route(
    app,
    {
      method: 'POST',
      url: '/v1/join',
      summary: 'Join a class with its code and a nickname; returns an anonymous profile and device token',
      tag: 'student',
      auth: 'none',
      body: JoinRequest,
      response: JoinResponse,
    },
    async ({ body }) => {
      const problem = checkNickname(body.nickname);
      if (problem) throw new HttpError(422, problem, 'please choose a different nickname');

      const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.classCode, body.classCode));
      if (!cls) throw notFound('class code');
      if (cls.programmeEndsAt && cls.programmeEndsAt <= app.now()) throw new HttpError(410, 'class_closed', 'this class has finished');

      let row: ProfileRow;
      try {
        [row] = (await db
          .insert(schema.studentProfiles)
          .values({
            classId: cls.id,
            nickname: body.nickname,
            avatar: body.avatar ?? null,
            language: body.language ?? cls.defaultLanguage,
          })
          .returning()) as [ProfileRow];
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('nickname_taken', 'someone in this class already has that nickname');
        throw err;
      }

      const token = signToken({ kind: 'student', sub: row.anonId, cls: cls.id }, app.jwtSecret, STUDENT_TTL_S, app.now());
      return { profile: toProfile(row), token, defaultLanguage: cls.defaultLanguage };
    },
  );

  route(
    app,
    { method: 'GET', url: '/v1/me', summary: 'The profile this device token belongs to', tag: 'student', auth: 'student', response: StudentProfile },
    async ({ student }) => toProfile(await loadProfile(db, student.sub)),
  );

  route(
    app,
    {
      method: 'PATCH',
      url: '/v1/me',
      summary: 'Change language, maturity level or avatar',
      tag: 'student',
      auth: 'student',
      body: UpdateProfileRequest,
      response: StudentProfile,
    },
    async ({ student, body }) => {
      const [row] = await db
        .update(schema.studentProfiles)
        .set({
          ...(body.language && { language: body.language }),
          ...(body.level && { maturityLevel: body.level }),
          ...(body.avatar !== undefined && { avatar: body.avatar }),
        })
        .where(eq(schema.studentProfiles.anonId, student.sub))
        .returning();
      if (!row) throw notFound('profile');
      return toProfile(row);
    },
  );
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}
