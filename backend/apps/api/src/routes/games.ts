import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Action, GameResponse, GameSummary, NewGameRequest, type GameState } from '@paisa/contracts';
import { currentView, hashSeed, newGame, step } from '@paisa/engine';
import { schema, type Db } from '@paisa/db';
import type { ContentStore } from '../content-store';
import { notFound } from '../errors';
import { insertEvents, serverEvents, touchProfile } from '../event-store';
import { route, UuidParam } from '../http';
import { loadProfile } from './student';

const lastScore = (s: GameState) => s.scores.at(-1) ?? null;

export async function gameRoutes(app: FastifyInstance, { db, content }: { db: Db; content: ContentStore }) {
  route(
    app,
    {
      method: 'POST',
      url: '/v1/games',
      summary: 'Start a game for a persona; the engine runs on the server',
      tag: 'game',
      auth: 'student',
      body: NewGameRequest,
      response: GameResponse,
    },
    async ({ student, body }) => {
      const profile = await loadProfile(db, student.sub);
      const [{ n }] = (await db
        .select({ n: count() })
        .from(schema.gameSaves)
        .where(eq(schema.gameSaves.profileId, profile.anonId))) as [{ n: number }];
      const seed = hashSeed(profile.anonId, body.personaId, String(n));
      const result = newGame({ personaId: body.personaId, level: body.level ?? profile.maturityLevel, seed }, content.game);
      const now = app.now();

      return db.transaction(async (tx) => {
        const [save] = await tx
          .insert(schema.gameSaves)
          .values({
            profileId: profile.anonId,
            personaId: body.personaId,
            packVersion: content.version,
            state: result.state,
            month: result.state.month,
            week: result.state.week,
            seed,
          })
          .returning({ id: schema.gameSaves.id });
        await insertEvents(tx, serverEvents(result.events, profile, now, 0));
        await touchProfile(tx, [profile.anonId], now);
        return { gameId: save!.id, personaId: body.personaId, packVersion: content.version, view: result.view, events: result.events };
      });
    },
  );

  route(
    app,
    { method: 'GET', url: '/v1/games', summary: "This profile's games, newest first", tag: 'game', auth: 'student', response: z.array(GameSummary) },
    async ({ student }) => {
      const rows = await db
        .select()
        .from(schema.gameSaves)
        .where(eq(schema.gameSaves.profileId, student.sub))
        .orderBy(desc(schema.gameSaves.updatedAt));
      return rows.map((r) => ({
        gameId: r.id,
        personaId: r.personaId,
        month: r.month,
        week: r.week,
        score: r.score,
        updatedAt: r.updatedAt.toISOString(),
      }));
    },
  );

  route(
    app,
    { method: 'GET', url: '/v1/games/:id', summary: 'The current view of a game', tag: 'game', auth: 'student', response: GameResponse },
    async ({ student, params }) => {
      const save = await findSave(db, params['id'], student.sub);
      return {
        gameId: save.id,
        personaId: save.personaId,
        packVersion: save.packVersion,
        view: currentView(save.state, content.game),
        events: [],
      };
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/games/:id/actions',
      summary: 'Play: choose, rewind or advance. Returns the next view and the events logged',
      tag: 'game',
      auth: 'student',
      body: Action,
      response: GameResponse,
    },
    async ({ student, params, body }) => {
      const id = UuidParam.parse(params['id']);
      const profile = await loadProfile(db, student.sub);
      const now = app.now();
      return db.transaction(async (tx) => {
        // Row lock: two taps from a flaky connection must not both apply.
        const [save] = await tx
          .select()
          .from(schema.gameSaves)
          .where(and(eq(schema.gameSaves.id, id), eq(schema.gameSaves.profileId, profile.anonId)))
          .for('update');
        if (!save) throw notFound('game');
        const result = step(save.state, body, content.game);
        await tx
          .update(schema.gameSaves)
          .set({
            state: result.state,
            month: result.state.month,
            week: result.state.week,
            score: lastScore(result.state),
            updatedAt: now,
          })
          .where(eq(schema.gameSaves.id, save.id));
        await insertEvents(tx, serverEvents(result.events, profile, now, result.state.decisions.length));
        await touchProfile(tx, [profile.anonId], now);
        return { gameId: save.id, personaId: save.personaId, packVersion: save.packVersion, view: result.view, events: result.events };
      });
    },
  );
}

async function findSave(db: Db, rawId: string | undefined, profileId: string) {
  const id = UuidParam.safeParse(rawId);
  if (!id.success) throw notFound('game');
  const [save] = await db
    .select()
    .from(schema.gameSaves)
    .where(and(eq(schema.gameSaves.id, id.data), eq(schema.gameSaves.profileId, profileId)));
  if (!save) throw notFound('game');
  return save;
}
