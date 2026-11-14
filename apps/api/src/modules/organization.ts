import { and, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { assignableRoles, createStaffSchema, outletSchema, updateStaffSchema } from '@tablewise/shared';
import { outlets, refreshTokens, userOutlets, users } from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { hashPassword } from '../lib/password.js';
import { audit } from '../lib/audit.js';

/** Organization-level administration: outlets and staff. */
export default async function organizationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ------------------------------------------------------------ Outlets
  app.post('/outlets', { preHandler: [app.requirePermission('outlet:manage')] }, async (req, reply) => {
    const input = parse(outletSchema, req.body);
    const outlet = await app.db.transaction(async (tx) => {
      const [o] = await tx.insert(outlets).values({ ...input, organizationId: req.user.org }).returning();
      await tx.insert(userOutlets).values({ userId: req.user.sub, outletId: o!.id });
      await audit(tx, req, { action: 'outlet.created', entityType: 'outlet', entityId: o!.id, outletId: o!.id });
      return o!;
    });
    reply.code(201);
    return outlet;
  });

  app.get('/outlets/:outletId', { preHandler: [app.requireOutlet] }, async (req) => {
    const { outletId } = req.params as { outletId: string };
    const [o] = await app.db.select().from(outlets).where(eq(outlets.id, outletId));
    return o;
  });

  app.put('/outlets/:outletId', {
    preHandler: [app.requireOutlet, app.requirePermission('outlet:manage')],
  }, async (req) => {
    const { outletId } = req.params as { outletId: string };
    const input = parse(outletSchema, req.body);
    return app.db.transaction(async (tx) => {
      const [o] = await tx.update(outlets).set(input).where(eq(outlets.id, outletId)).returning();
      await audit(tx, req, { action: 'outlet.updated', entityType: 'outlet', entityId: outletId, outletId, metadata: input });
      return o;
    });
  });

  // ------------------------------------------------------------ Staff
  /** Outlets the acting user may administer. */
  async function managedOutletIds(req: FastifyRequest): Promise<string[]> {
    if (req.user.role === 'OWNER') {
      const rows = await app.db.select({ id: outlets.id }).from(outlets).where(eq(outlets.organizationId, req.user.org));
      return rows.map((r) => r.id);
    }
    const rows = await app.db.select({ id: userOutlets.outletId }).from(userOutlets).where(eq(userOutlets.userId, req.user.sub));
    return rows.map((r) => r.id);
  }

  async function assertCanAssign(req: FastifyRequest, role: string | undefined, outletIds: string[] | undefined) {
    if (role && !assignableRoles(req.user.role).includes(role as never)) {
      throw forbidden(`You cannot assign the ${role} role`);
    }
    if (outletIds) {
      const allowed = new Set(await managedOutletIds(req));
      if (outletIds.some((id) => !allowed.has(id))) throw forbidden('You cannot assign staff to that outlet');
    }
  }

  app.get('/staff', { preHandler: [app.requirePermission('staff:manage')] }, async (req) => {
    const allowed = await managedOutletIds(req);
    const rows = await app.db.select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
    }).from(users).where(eq(users.organizationId, req.user.org)).orderBy(users.name);
    const links = rows.length
      ? await app.db.select().from(userOutlets).where(inArray(userOutlets.userId, rows.map((r) => r.id)))
      : [];
    const byUser = new Map<string, string[]>();
    for (const l of links) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l.outletId]);
    return rows
      .map((r) => ({ ...r, outletIds: byUser.get(r.id) ?? [] }))
      // Managers only see staff who share at least one of their outlets.
      .filter((r) => req.user.role === 'OWNER' || r.outletIds.some((o) => allowed.includes(o)));
  });

  app.post('/staff', { preHandler: [app.requirePermission('staff:manage')] }, async (req, reply) => {
    const input = parse(createStaffSchema, req.body);
    await assertCanAssign(req, input.role, input.outletIds);
    const dup = await app.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (dup.length) throw conflict('A user with this email already exists');
    const passwordHash = await hashPassword(input.password);
    const created = await app.db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({
        organizationId: req.user.org, name: input.name, email: input.email, role: input.role, passwordHash,
      }).returning({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive });
      await tx.insert(userOutlets).values(input.outletIds.map((outletId) => ({ userId: u!.id, outletId })));
      await audit(tx, req, { action: 'staff.created', entityType: 'user', entityId: u!.id, metadata: { role: input.role } });
      return u!;
    });
    reply.code(201);
    return { ...created, outletIds: input.outletIds };
  });

  app.patch('/staff/:userId', { preHandler: [app.requirePermission('staff:manage')] }, async (req) => {
    const { userId } = req.params as { userId: string };
    const input = parse(updateStaffSchema, req.body);
    const [target] = await app.db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, req.user.org)));
    if (!target) throw notFound('User');
    if (!assignableRoles(req.user.role).includes(target.role)) throw forbidden('You cannot modify this user');
    if (target.id === req.user.sub && (input.isActive === false || input.role)) {
      throw badRequest('You cannot change your own role or deactivate yourself');
    }
    await assertCanAssign(req, input.role, input.outletIds);
    if (req.user.role !== 'OWNER') {
      const allowed = new Set(await managedOutletIds(req));
      const current = await app.db.select().from(userOutlets).where(eq(userOutlets.userId, userId));
      if (!current.some((l) => allowed.has(l.outletId))) throw forbidden('You cannot modify this user');
    }

    return app.db.transaction(async (tx) => {
      const patch: Partial<typeof users.$inferInsert> = {};
      if (input.name) patch.name = input.name;
      if (input.role) patch.role = input.role;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.password) patch.passwordHash = await hashPassword(input.password);
      if (Object.keys(patch).length) await tx.update(users).set(patch).where(eq(users.id, userId));
      if (input.outletIds) {
        await tx.delete(userOutlets).where(eq(userOutlets.userId, userId));
        await tx.insert(userOutlets).values(input.outletIds.map((outletId) => ({ userId, outletId })));
      }
      if (input.isActive === false || input.password) {
        await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, userId));
      }
      const { password: _pw, ...meta } = input;
      await audit(tx, req, {
        action: 'staff.updated', entityType: 'user', entityId: userId,
        metadata: { ...meta, passwordReset: !!input.password },
      });
      const [u] = await tx.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
        .from(users).where(eq(users.id, userId));
      const links = await tx.select().from(userOutlets).where(eq(userOutlets.userId, userId));
      return { ...u, outletIds: links.map((l) => l.outletId) };
    });
  });
}
