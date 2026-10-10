import type { FastifyPluginAsync } from 'fastify';
import { CONTRACTS_VERSION } from '@paisa/contracts';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok', contractsVersion: CONTRACTS_VERSION }));
};
