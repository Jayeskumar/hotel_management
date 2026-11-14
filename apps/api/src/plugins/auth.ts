import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { can, type Permission, type Role } from '@tablewise/shared';
import { outlets, userOutlets, users } from '../db/schema.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';

export interface AccessTokenPayload {
  sub: string;
  org: string;
  role: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOutlet: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (p: Permission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  await app.register(jwt, {
    secret: app.config.JWT_SECRET,
    sign: { expiresIn: app.config.ACCESS_TOKEN_TTL, iss: 'tablewise' },
    verify: { allowedIss: 'tablewise' },
  });

  /**
   * Verifies the access token and re-checks that the user still exists and is
   * active, so deactivated staff lose access immediately rather than at expiry.
   */
  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('auth.invalidToken');
    }
    const [u] = await app.db
      .select({ isActive: users.isActive, role: users.role, org: users.organizationId })
      .from(users)
      .where(eq(users.id, req.user.sub));
    if (!u || !u.isActive || u.org !== req.user.org) throw unauthorized('auth.disabled');
    // Role changes take effect immediately.
    req.user.role = u.role;
  });

  /** Ensures the :outletId in the URL belongs to the user's org and the user is assigned to it. */
  app.decorate('requireOutlet', async (req: FastifyRequest) => {
    const { outletId } = req.params as { outletId?: string };
    if (!outletId || !/^[0-9a-f-]{36}$/i.test(outletId)) throw notFound('entity.outlet');
    const [outlet] = await app.db
      .select({ id: outlets.id })
      .from(outlets)
      .where(and(eq(outlets.id, outletId), eq(outlets.organizationId, req.user.org)));
    if (!outlet) throw notFound('entity.outlet');
    if (req.user.role === 'OWNER') return;
    const [link] = await app.db
      .select()
      .from(userOutlets)
      .where(and(eq(userOutlets.userId, req.user.sub), eq(userOutlets.outletId, outletId)));
    if (!link) throw forbidden('staff.notAssigned');
  });

  app.decorate('requirePermission', (permission: Permission) => async (req: FastifyRequest) => {
    if (!can(req.user.role, permission)) throw forbidden();
  });
});
