import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Language, PackManifest, Projection, ProjectionRequest } from '@paisa/contracts';
import { projectGrowth } from '@paisa/engine';
import type { ContentStore } from '../content-store';
import { notFound } from '../errors';
import { route } from '../http';

export async function contentRoutes(app: FastifyInstance, { content }: { content: ContentStore }) {
  route(
    app,
    {
      method: 'GET',
      url: '/v1/content/manifest',
      summary: 'Which content packs exist for a region, with hashes so phones only download changes',
      tag: 'content',
      auth: 'none',
      query: z.object({ region: z.string().optional(), lang: Language.optional() }),
      response: PackManifest,
    },
    async ({ query }) => {
      if (query.region && query.region !== content.region) throw notFound('region');
      return content.manifest(query.lang);
    },
  );

  route(
    app,
    {
      method: 'GET',
      url: '/v1/content/packs/:id',
      summary: 'Download one content pack (ContentPack JSON). Immutable per version',
      tag: 'content',
      auth: 'none',
      produces: 'application/json',
    },
    async ({ params, req, reply }) => {
      const stored = content.packs.get(params['id'] ?? '');
      if (!stored) throw notFound('pack');
      const etag = `"${stored.entry.sha256}"`;
      reply.header('etag', etag).header('cache-control', 'public, max-age=31536000, immutable');
      if (req.headers['if-none-match'] === etag) return reply.code(304).send();
      return reply.type('application/json').send(stored.body);
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/tools/projection',
      summary: 'Time Machine: good, average and bad outcomes under assumed rates. Never one number',
      tag: 'tools',
      auth: 'none',
      body: ProjectionRequest,
      response: Projection,
    },
    async ({ body }) => projectGrowth(body.monthlyAmount, body.years ?? [1, 5, 10, 20], content.game.tuning.projection),
  );
}
