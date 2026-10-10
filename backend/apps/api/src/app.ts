import cors from '@fastify/cors';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { CONTRACTS_VERSION } from '@paisa/contracts';
import { EngineError } from '@paisa/engine';
import type { Db } from '@paisa/db';
import type { Config } from './config';
import { loadContentStore, type ContentStore } from './content-store';
import { HttpError } from './errors';
import { openApiDocument } from './http';
import { classRoutes } from './routes/classes';
import { contentRoutes } from './routes/content';
import { gameRoutes } from './routes/games';
import { healthRoutes } from './routes/health';
import { orgRoutes } from './routes/orgs';
import { quizRoutes } from './routes/quizzes';
import { staffAuthRoutes, type Mailer } from './routes/staff-auth';
import { studentRoutes } from './routes/student';
import { syncRoutes } from './routes/sync';

export interface AppDeps {
  /** Routes that need the database are registered only when one is given. */
  db?: Db;
  content?: ContentStore;
  mailer?: Mailer;
  now?: () => Date;
}

const ENGINE_STATUS: Record<string, number> = {
  invalid_action: 409,
  unknown_choice: 400,
  no_rewind: 409,
  game_over: 409,
  unknown_persona: 400,
  no_cards: 500,
};

export function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL },
    bodyLimit: 1024 * 1024,
  });
  const content = deps.content ?? loadContentStore(config.CONTENT_DIR, config.PACK_REGION, config.PACK_VERSION);
  const mailer: Mailer = deps.mailer ?? {
    async sendOtp(email, code) {
      if (config.NODE_ENV === 'production') {
        app.log.warn({ email }, 'no mailer configured: sign-in code not sent');
      } else {
        app.log.info({ email, code }, 'staff sign-in code (dev mailer)');
      }
    },
  };

  app.decorate('routeDocs', []);
  app.decorate('now', deps.now ?? (() => new Date()));
  app.decorate('jwtSecret', config.JWT_SECRET);

  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length > 0) app.register(cors, { origin: origins, methods: ['GET', 'POST', 'PATCH'] });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return reply.code(400).send({ error: 'bad_request', message });
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    if (err instanceof EngineError) return reply.code(ENGINE_STATUS[err.code] ?? 400).send({ error: err.code, message: err.message });
    const status = (err as FastifyError).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'bad_request', message: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'something went wrong' });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'not_found', message: `${req.method} ${req.url} not found` }));

  app.register(healthRoutes);
  app.register(contentRoutes, { content });
  if (deps.db) {
    const db = deps.db;
    app.register(studentRoutes, { db });
    app.register(gameRoutes, { db, content });
    app.register(syncRoutes, { db });
    app.register(quizRoutes, { db, content });
    app.register(staffAuthRoutes, { db, mailer, devEcho: config.OTP_DEV_ECHO });
    app.register(orgRoutes, { db });
    app.register(classRoutes, { db });
  }
  app.get('/v1/openapi.json', async () => openApiDocument(app.routeDocs, CONTRACTS_VERSION));

  return app;
}
