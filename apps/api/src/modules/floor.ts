import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { areaSchema, SOCKET_EVENTS, tableSchema, tableStatusSchema } from '@tablewise/shared';
import { areas, diningTables, orders } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { outletIdOf } from '../lib/http.js';
import { audit } from '../lib/audit.js';

export default async function floorRoutes(app: FastifyInstance) {
  /** Full floor: areas, tables and the open order (if any) on each table. */
  app.get('/floor', async (req) => {
    const outletId = outletIdOf(req);
    const [areaRows, tableRows, openOrders] = await Promise.all([
      app.db.select().from(areas).where(eq(areas.outletId, outletId)).orderBy(asc(areas.sortOrder), asc(areas.name)),
      app.db.select().from(diningTables)
        .where(and(eq(diningTables.outletId, outletId), eq(diningTables.isActive, true)))
        .orderBy(asc(diningTables.label)),
      app.db.select({
        id: orders.id, tableId: orders.tableId, orderNumber: orders.orderNumber, totalCents: orders.totalCents,
        guestCount: orders.guestCount, openedAt: orders.openedAt,
      }).from(orders).where(and(eq(orders.outletId, outletId), eq(orders.status, 'OPEN'))),
    ]);
    const byTable = new Map(openOrders.filter((o) => o.tableId).map((o) => [o.tableId!, o]));
    return {
      areas: areaRows,
      tables: tableRows.map((t) => ({ ...t, openOrder: byTable.get(t.id) ?? null })),
    };
  });

  // ---------------------------------------------------------- Areas
  app.post('/areas', { preHandler: [app.requirePermission('tables:manage')] }, async (req, reply) => {
    const outletId = outletIdOf(req);
    const input = parse(areaSchema, req.body);
    const [a] = await app.db.insert(areas).values({ ...input, outletId }).returning();
    await audit(app.db, req, { action: 'area.created', entityType: 'area', entityId: a!.id, outletId });
    reply.code(201);
    return a;
  });

  app.put('/areas/:id', { preHandler: [app.requirePermission('tables:manage')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const input = parse(areaSchema, req.body);
    const [a] = await app.db.update(areas).set(input)
      .where(and(eq(areas.id, id), eq(areas.outletId, outletId))).returning();
    if (!a) throw notFound('entity.area');
    return a;
  });

  app.delete('/areas/:id', { preHandler: [app.requirePermission('tables:manage')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const tables = await app.db.select({ id: diningTables.id }).from(diningTables)
      .where(and(eq(diningTables.areaId, id), eq(diningTables.isActive, true)));
    if (tables.length) throw conflict('area.hasTables');
    // Inactive tables still reference the area; delete them only if they have no history.
    const deleted = await app.db.transaction(async (tx) => {
      const inactive = await tx.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.areaId, id));
      if (inactive.length) {
        const used = await tx.select({ id: orders.id }).from(orders)
          .where(inArray(orders.tableId, inactive.map((t) => t.id))).limit(1);
        if (used.length) throw conflict('area.hasHistory');
        await tx.delete(diningTables).where(eq(diningTables.areaId, id));
      }
      return tx.delete(areas).where(and(eq(areas.id, id), eq(areas.outletId, outletId))).returning();
    });
    if (!deleted.length) throw notFound('entity.area');
    await audit(app.db, req, { action: 'area.deleted', entityType: 'area', entityId: id, outletId });
    return { ok: true };
  });

  // ---------------------------------------------------------- Tables
  async function assertArea(outletId: string, areaId: string) {
    const [a] = await app.db.select({ id: areas.id }).from(areas)
      .where(and(eq(areas.id, areaId), eq(areas.outletId, outletId)));
    if (!a) throw notFound('entity.area');
  }

  app.post('/tables', { preHandler: [app.requirePermission('tables:manage')] }, async (req, reply) => {
    const outletId = outletIdOf(req);
    const input = parse(tableSchema, req.body);
    await assertArea(outletId, input.areaId);
    const dup = await app.db.select({ id: diningTables.id, isActive: diningTables.isActive }).from(diningTables)
      .where(and(eq(diningTables.outletId, outletId), eq(diningTables.label, input.label)));
    let table;
    if (dup[0] && !dup[0].isActive) {
      [table] = await app.db.update(diningTables).set({ ...input, isActive: true, status: 'AVAILABLE' })
        .where(eq(diningTables.id, dup[0].id)).returning();
    } else if (dup.length) {
      throw conflict('table.exists', { table: input.label });
    } else {
      [table] = await app.db.insert(diningTables).values({ ...input, outletId }).returning();
    }
    await audit(app.db, req, { action: 'table.created', entityType: 'table', entityId: table!.id, outletId });
    app.realtime.emit(outletId, SOCKET_EVENTS.TABLE_UPDATED, { id: table!.id });
    reply.code(201);
    return table;
  });

  app.put('/tables/:id', { preHandler: [app.requirePermission('tables:manage')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const input = parse(tableSchema, req.body);
    await assertArea(outletId, input.areaId);
    const dup = await app.db.select({ id: diningTables.id }).from(diningTables)
      .where(and(eq(diningTables.outletId, outletId), eq(diningTables.label, input.label)));
    if (dup[0] && dup[0].id !== id) throw conflict('table.exists', { table: input.label });
    const [t] = await app.db.update(diningTables).set(input)
      .where(and(eq(diningTables.id, id), eq(diningTables.outletId, outletId))).returning();
    if (!t) throw notFound('entity.table');
    app.realtime.emit(outletId, SOCKET_EVENTS.TABLE_UPDATED, { id });
    return t;
  });

  app.delete('/tables/:id', { preHandler: [app.requirePermission('tables:manage')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const open = await app.db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.tableId, id), eq(orders.status, 'OPEN')));
    if (open.length) throw conflict('table.thisHasOpenOrder');
    // Soft-delete to preserve order history.
    const [t] = await app.db.update(diningTables).set({ isActive: false })
      .where(and(eq(diningTables.id, id), eq(diningTables.outletId, outletId))).returning();
    if (!t) throw notFound('entity.table');
    await audit(app.db, req, { action: 'table.deleted', entityType: 'table', entityId: id, outletId });
    app.realtime.emit(outletId, SOCKET_EVENTS.TABLE_UPDATED, { id });
    return { ok: true };
  });

  app.patch('/tables/:id/status', { preHandler: [app.requirePermission('tables:update_status')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const { status } = parse(tableStatusSchema, req.body);
    const open = await app.db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.tableId, id), eq(orders.status, 'OPEN')));
    if (open.length && status !== 'OCCUPIED') throw conflict('table.closeOrderFirst');
    const [t] = await app.db.update(diningTables).set({ status, statusChangedAt: new Date() })
      .where(and(eq(diningTables.id, id), eq(diningTables.outletId, outletId))).returning();
    if (!t) throw notFound('entity.table');
    app.realtime.emit(outletId, SOCKET_EVENTS.TABLE_UPDATED, { id, status });
    return t;
  });
}
