import Fastify from 'fastify';
import type { Config } from './config';
import { healthRoutes } from './routes/health';

export function buildApp(config: Config) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL },
  });

  app.register(healthRoutes);

  return app;
}
