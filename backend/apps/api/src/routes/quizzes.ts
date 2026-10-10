import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Pillar, QuizKind, QuizResult, QuizStartResponse, QuizSubmitRequest } from '@paisa/contracts';
import { assembleQuiz, scoreQuiz } from '@paisa/engine';
import { schema, type Db } from '@paisa/db';
import type { ContentStore } from '../content-store';
import { badRequest, conflict, notFound } from '../errors';
import { insertEvents, serverEvents, touchProfile } from '../event-store';
import { route, UuidParam } from '../http';
import { loadProfile } from './student';

export async function quizRoutes(app: FastifyInstance, { db, content }: { db: Db; content: ContentStore }) {
  route(
    app,
    {
      method: 'POST',
      url: '/v1/quizzes/:kind/start',
      summary: 'Start a baseline, module, end-line or retention quiz. Answers are not sent to the phone',
      tag: 'quiz',
      auth: 'student',
      body: z.strictObject({ pillar: Pillar.optional() }),
      response: QuizStartResponse,
    },
    async ({ student, params, body }) => {
      const kind = QuizKind.safeParse(params['kind']);
      if (!kind.success) throw notFound('quiz kind');
      if (kind.data === 'module' && !body.pillar) throw badRequest('a module quiz needs a pillar');
      const profile = await loadProfile(db, student.sub);
      const questions = assembleQuiz(content.game, { kind: kind.data, pillar: body.pillar });
      if (questions.length === 0) throw notFound('questions for this quiz');

      const [attempt] = await db
        .insert(schema.quizAttempts)
        .values({
          profileId: profile.anonId,
          classId: profile.classId,
          kind: kind.data,
          pillar: body.pillar ?? null,
          questionIds: questions.map((q) => q.id),
          startedAt: app.now(),
        })
        .returning({ id: schema.quizAttempts.id });
      return {
        attemptId: attempt!.id,
        kind: kind.data,
        questions: questions.map((q) => ({ id: q.id, pillar: q.pillar, text: q.text, options: q.options })),
      };
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/quizzes/:attemptId/submit',
      summary: 'Submit answers once; returns the score and an explanation per question',
      tag: 'quiz',
      auth: 'student',
      body: QuizSubmitRequest,
      response: QuizResult,
    },
    async ({ student, params, body }) => {
      const attemptId = UuidParam.safeParse(params['attemptId']);
      if (!attemptId.success) throw notFound('quiz attempt');
      const profile = await loadProfile(db, student.sub);
      const now = app.now();

      return db.transaction(async (tx) => {
        const [attempt] = await tx
          .select()
          .from(schema.quizAttempts)
          .where(and(eq(schema.quizAttempts.id, attemptId.data), eq(schema.quizAttempts.profileId, profile.anonId)))
          .for('update');
        if (!attempt) throw notFound('quiz attempt');
        if (attempt.submittedAt) throw conflict('already_submitted', 'this quiz was already submitted');

        const byId = new Map(content.game.quizQuestions.map((q) => [q.id, q]));
        const questions = attempt.questionIds.map((id) => byId.get(id)).filter((q) => q !== undefined);
        const result = scoreQuiz(questions, body.answers);

        await tx
          .update(schema.quizAttempts)
          .set({ answers: body.answers, score: result.score, byPillar: result.byPillar, submittedAt: now })
          .where(eq(schema.quizAttempts.id, attempt.id));
        await insertEvents(
          tx,
          serverEvents(
            [{ type: 'quiz_submitted', payload: { attemptId: attempt.id, kind: attempt.kind, score: result.score, pillar: attempt.pillar } }],
            profile,
            now,
            0,
          ),
        );
        await touchProfile(tx, [profile.anonId], now);
        return result;
      });
    },
  );
}
