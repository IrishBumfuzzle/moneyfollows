import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
import type { StaffRole } from '@paisa/contracts';
import { forbidden, unauthorized } from './errors';
import type { StaffClaims, StudentClaims } from './tokens';
import { verifyToken } from './tokens';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Auth = 'none' | 'student' | 'staff';

export interface RouteDoc<B extends ZodType = ZodType, Q extends ZodType = ZodType> {
  method: Method;
  url: string;
  summary: string;
  tag: string;
  auth: Auth;
  /** Staff roles allowed; omitted means any staff role. */
  roles?: StaffRole[];
  body?: B;
  query?: Q;
  response?: ZodType;
  /** Non-JSON responses (e.g. a pack download) can describe themselves here. */
  produces?: string;
}

export interface RouteCtx<B, Q> {
  req: FastifyRequest;
  reply: FastifyReply;
  body: B;
  query: Q;
  params: Record<string, string>;
  student: StudentClaims;
  staff: StaffClaims;
}

declare module 'fastify' {
  interface FastifyInstance {
    routeDocs: RouteDoc[];
    now: () => Date;
    jwtSecret: string;
  }
}

/**
 * Registers a route whose body and query are parsed with zod and whose auth is
 * checked before the handler runs. Every route is recorded for the OpenAPI document.
 */
export function route<B extends ZodType = ZodType<undefined>, Q extends ZodType = ZodType<undefined>>(
  app: FastifyInstance,
  doc: RouteDoc<B, Q>,
  handler: (ctx: RouteCtx<z.infer<B>, z.infer<Q>>) => Promise<unknown>,
): void {
  app.routeDocs.push(doc as RouteDoc);
  app.route({
    method: doc.method,
    url: doc.url,
    handler: async (req, reply) => {
      const claims = authenticate(app, req, doc);
      const body = doc.body ? doc.body.parse(req.body ?? {}) : undefined;
      const query = doc.query ? doc.query.parse(req.query ?? {}) : undefined;
      const result = await handler({
        req,
        reply,
        body: body as z.infer<B>,
        query: query as z.infer<Q>,
        params: (req.params ?? {}) as Record<string, string>,
        student: claims as StudentClaims,
        staff: claims as StaffClaims,
      });
      return result;
    },
  });
}

function authenticate(app: FastifyInstance, req: FastifyRequest, doc: RouteDoc) {
  if (doc.auth === 'none') return undefined;
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const claims = token ? verifyToken(token, app.jwtSecret, app.now()) : null;
  if (!claims) throw unauthorized();
  if (claims.kind !== doc.auth) throw forbidden(`this route is for ${doc.auth} accounts`);
  if (claims.kind === 'staff' && doc.roles && !doc.roles.includes(claims.role)) {
    throw forbidden(`needs one of: ${doc.roles.join(', ')}`);
  }
  return claims;
}

export const UuidParam = z.uuid();

/** OpenAPI 3.1 document generated from the recorded routes and their zod schemas. */
export function openApiDocument(docs: RouteDoc[], version: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  const json = (schema: ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  for (const d of docs) {
    const path = d.url.replace(/:([A-Za-z]+)/g, '{$1}');
    const params = [...d.url.matchAll(/:([A-Za-z]+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    const query = d.query
      ? Object.entries((json(d.query) as { properties?: Record<string, unknown> }).properties ?? {}).map(([name, schema]) => ({
          name,
          in: 'query',
          schema,
        }))
      : [];
    paths[path] ??= {};
    paths[path][d.method.toLowerCase()] = {
      summary: d.summary,
      tags: [d.tag],
      security: d.auth === 'none' ? [] : [{ [d.auth]: [] }],
      ...(d.roles ? { 'x-roles': d.roles } : {}),
      parameters: [...params, ...query],
      ...(d.body ? { requestBody: { required: true, content: { 'application/json': { schema: json(d.body) } } } } : {}),
      responses: {
        '200': {
          description: 'OK',
          content: d.produces
            ? { [d.produces]: {} }
            : d.response
              ? { 'application/json': { schema: z.toJSONSchema(d.response, { unrepresentable: 'any' }) } }
              : {},
        },
        default: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Paisa Path API', version },
    paths,
    components: {
      securitySchemes: {
        student: { type: 'http', scheme: 'bearer', description: 'Device token from POST /v1/join' },
        staff: { type: 'http', scheme: 'bearer', description: 'Session token from POST /v1/auth/otp/verify' },
      },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } }, required: ['error', 'message'] },
      },
    },
  };
}
