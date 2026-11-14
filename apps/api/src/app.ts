import crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import type { Config } from './config.js';
import type { DB } from './db/client.js';
import { formatMessage, type MessageKey, type MessageParams } from '@tablewise/shared';
import { AppError } from './lib/errors.js';
import { Realtime } from './lib/realtime.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './modules/auth.js';
import organizationRoutes from './modules/organization.js';
import floorRoutes from './modules/floor.js';
import menuRoutes from './modules/menu.js';
import orderRoutes from './modules/orders.js';
import kitchenRoutes from './modules/kitchen.js';
import reservationRoutes from './modules/reservations.js';
import inventoryRoutes from './modules/inventory.js';
import reportRoutes from './modules/reports.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: DB;
    realtime: Realtime;
  }
}

export async function buildApp(opts: { config: Config; db: DB; logger?: boolean }): Promise<FastifyInstance> {
  const { config, db } = opts;
  const app = Fastify({
    logger: opts.logger === false ? false : {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || crypto.randomUUID(),
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('realtime', new Realtime());

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    allowList: () => config.NODE_ENV === 'test',
  });
  await app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    const send = (status: number, code: string, key: MessageKey, params?: MessageParams, extra: Record<string, unknown> = {}) =>
      reply.code(status).send({ error: { code, key, params, message: formatMessage('en', key, params), ...extra } });
    if (err instanceof AppError) {
      return send(err.statusCode, err.code, err.key, err.params, err.details ? { details: err.details } : {});
    }
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode === 429) return send(429, 'RATE_LIMITED', 'error.rateLimited');
    if (e.statusCode && e.statusCode < 500) return send(e.statusCode, e.code ?? 'BAD_REQUEST', 'error.badRequest');
    // Postgres unique violation -> 409
    const pgCode = (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
    if (pgCode === '23505') return send(409, 'CONFLICT', 'error.duplicate');
    req.log.error({ err }, 'unhandled error');
    return send(500, 'INTERNAL', 'error.internal', undefined, { requestId: req.id });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', key: 'error.notFound', params: { entity: 'entity.route' }, message: 'Page not found' } });
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(organizationRoutes);
    await api.register(async (outletScope) => {
      outletScope.addHook('preHandler', outletScope.authenticate);
      outletScope.addHook('preHandler', outletScope.requireOutlet);
      await outletScope.register(floorRoutes);
      await outletScope.register(menuRoutes);
      await outletScope.register(orderRoutes);
      await outletScope.register(kitchenRoutes);
      await outletScope.register(reservationRoutes);
      await outletScope.register(inventoryRoutes);
      await outletScope.register(reportRoutes);
    }, { prefix: '/outlets/:outletId' });
  }, { prefix: '/api/v1' });

  return app;
}
