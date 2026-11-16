import { Server } from 'socket.io';
import { and, eq } from 'drizzle-orm';
import { loadConfig, type Config } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { buildApp } from './app.js';
import { outlets, userOutlets, users } from './db/schema.js';
import type { AccessTokenPayload } from './plugins/auth.js';
import type { SystemHooks } from './lib/system.js';

export interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * Starts the HTTP + WebSocket server. Used by the cloud entry point (main.ts)
 * and by the on-prem launcher, so both deployments run identical code.
 */
export async function startServer(opts: { config?: Config; hooks?: SystemHooks } = {}): Promise<RunningServer> {
  const config = opts.config ?? loadConfig();
  if (process.env.MIGRATE_ON_START !== 'false') await runMigrations(config.DATABASE_URL);

  const { db, pool } = createDb(config.DATABASE_URL, config.DB_POOL_MAX);
  const app = await buildApp({ config, db, hooks: opts.hooks });

  const io = new Server(app.server, {
    path: '/socket.io',
    // Same-origin on single-port deployments; explicit origins for the cloud SPA.
    cors: config.WEB_DIR ? undefined : { origin: config.CORS_ORIGINS.split(','), credentials: true },
  });

  /** Socket auth: access token in the handshake; clients join rooms only for outlets they can access. */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('unauthorized'));
      socket.data.user = app.jwt.verify<AccessTokenPayload>(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join', async (outletId: unknown, ack?: (r: { ok: boolean }) => void) => {
      const user = socket.data.user as AccessTokenPayload;
      if (typeof outletId !== 'string' || !/^[0-9a-f-]{36}$/i.test(outletId)) return ack?.({ ok: false });
      const [u] = await db.select({ isActive: users.isActive, role: users.role }).from(users).where(eq(users.id, user.sub));
      const [o] = await db.select({ id: outlets.id }).from(outlets)
        .where(and(eq(outlets.id, outletId), eq(outlets.organizationId, user.org)));
      let allowed = !!u?.isActive && !!o;
      if (allowed && u!.role !== 'OWNER') {
        const link = await db.select().from(userOutlets)
          .where(and(eq(userOutlets.userId, user.sub), eq(userOutlets.outletId, outletId)));
        allowed = link.length > 0;
      }
      if (!allowed) return ack?.({ ok: false });
      for (const room of socket.rooms) if (room.startsWith('outlet:')) await socket.leave(room);
      await socket.join(`outlet:${outletId}`);
      ack?.({ ok: true });
    });
  });

  app.realtime.attach(io);
  const url = await app.listen({ port: config.PORT, host: config.HOST });

  return {
    url,
    close: async () => {
      io.disconnectSockets(true);
      await app.close();
      await pool.end();
    },
  };
}
