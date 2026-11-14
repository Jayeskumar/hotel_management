import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { inventoryItemSchema, SOCKET_EVENTS, stockMovementSchema } from '@tablewise/shared';
import { inventoryItems, stockMovements, users } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { outletIdOf } from '../lib/http.js';
import { audit } from '../lib/audit.js';

export default async function inventoryRoutes(app: FastifyInstance) {
  const view = { preHandler: [app.requirePermission('inventory:view')] };
  const manage = { preHandler: [app.requirePermission('inventory:manage')] };

  app.get('/inventory', view, async (req) => {
    const outletId = outletIdOf(req);
    const rows = await app.db.select().from(inventoryItems).where(eq(inventoryItems.outletId, outletId)).orderBy(asc(inventoryItems.name));
    return rows.map((r) => ({ ...r, isLow: r.quantityOnHand <= r.reorderLevel }));
  });

  app.post('/inventory', manage, async (req, reply) => {
    const outletId = outletIdOf(req);
    const input = parse(inventoryItemSchema, req.body);
    const dup = await app.db.select({ id: inventoryItems.id }).from(inventoryItems)
      .where(and(eq(inventoryItems.outletId, outletId), eq(inventoryItems.name, input.name)));
    if (dup.length) throw conflict('inventory.exists', { name: input.name });
    const [row] = await app.db.insert(inventoryItems).values({ ...input, outletId }).returning();
    reply.code(201);
    return row;
  });

  app.put('/inventory/:id', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const input = parse(inventoryItemSchema, req.body);
    const [row] = await app.db.update(inventoryItems).set(input)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.outletId, outletId))).returning();
    if (!row) throw notFound('entity.inventoryItem');
    return row;
  });

  app.delete('/inventory/:id', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const d = await app.db.delete(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.outletId, outletId))).returning();
    if (!d.length) throw notFound('entity.inventoryItem');
    await audit(app.db, req, { action: 'inventory.deleted', entityType: 'inventory_item', entityId: id, outletId, metadata: { name: d[0]!.name } });
    return { ok: true };
  });

  app.post('/inventory/:id/movements', manage, async (req, reply) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const input = parse(stockMovementSchema, req.body);
    // Purchases add stock; usage and waste remove it regardless of the sign sent.
    const delta = input.reason === 'PURCHASE' ? Math.abs(input.delta)
      : input.reason === 'ADJUSTMENT' ? input.delta : -Math.abs(input.delta);
    const item = await app.db.transaction(async (tx) => {
      const [row] = await tx.update(inventoryItems)
        .set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} + ${delta}` })
        .where(and(eq(inventoryItems.id, id), eq(inventoryItems.outletId, outletId))).returning();
      if (!row) throw notFound('entity.inventoryItem');
      await tx.insert(stockMovements).values({
        inventoryItemId: id, outletId, delta, reason: input.reason, note: input.note ?? null, createdById: req.user.sub,
      });
      await audit(tx, req, { action: 'inventory.movement', entityType: 'inventory_item', entityId: id, outletId, metadata: { delta, reason: input.reason } });
      return row;
    });
    if (item.quantityOnHand <= item.reorderLevel) {
      app.realtime.emit(outletId, SOCKET_EVENTS.INVENTORY_LOW, [{ id: item.id, name: item.name, quantityOnHand: item.quantityOnHand }]);
    }
    reply.code(201);
    return { ...item, isLow: item.quantityOnHand <= item.reorderLevel };
  });

  app.get('/inventory/:id/movements', view, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    return app.db.select({ movement: stockMovements, userName: users.name }).from(stockMovements)
      .leftJoin(users, eq(users.id, stockMovements.createdById))
      .where(and(eq(stockMovements.inventoryItemId, id), eq(stockMovements.outletId, outletId)))
      .orderBy(desc(stockMovements.createdAt)).limit(200)
      .then((rows) => rows.map((r) => ({ ...r.movement, userName: r.userName })));
  });
}
