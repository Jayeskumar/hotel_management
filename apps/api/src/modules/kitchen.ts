import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ITEM_TRANSITIONS, itemStatusSchema, SOCKET_EVENTS, STATIONS } from '@tablewise/shared';
import { diningTables, orderItems, orders } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { outletIdOf } from '../lib/http.js';

const stationQuery = z.object({ station: z.enum(STATIONS).optional() });
const ACTIVE = ['QUEUED', 'PREPARING', 'READY'] as const;

/** Kitchen Display System: tickets grouped by order, oldest first. */
export default async function kitchenRoutes(app: FastifyInstance) {
  app.get('/kitchen', { preHandler: [app.requirePermission('kitchen:view')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { station } = parse(stationQuery, req.query);
    const rows = await app.db.select({
      item: orderItems,
      orderNumber: orders.orderNumber, orderType: orders.type, orderNotes: orders.notes,
      customerName: orders.customerName, tableLabel: diningTables.label,
    }).from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
      .where(and(
        eq(orderItems.outletId, outletId),
        eq(orders.status, 'OPEN'),
        inArray(orderItems.status, [...ACTIVE]),
        ...(station ? [eq(orderItems.station, station)] : []),
      ))
      .orderBy(asc(orderItems.firedAt), asc(orderItems.createdAt));

    const tickets = new Map<string, {
      orderId: string; orderNumber: number; orderType: string; tableLabel: string | null;
      customerName: string | null; notes: string | null; firedAt: Date | null; items: typeof orderItems.$inferSelect[];
    }>();
    for (const r of rows) {
      let t = tickets.get(r.item.orderId);
      if (!t) {
        t = {
          orderId: r.item.orderId, orderNumber: r.orderNumber, orderType: r.orderType, tableLabel: r.tableLabel,
          customerName: r.customerName, notes: r.orderNotes, firedAt: r.item.firedAt, items: [],
        };
        tickets.set(r.item.orderId, t);
      }
      t.items.push(r.item);
    }
    return [...tickets.values()];
  });

  app.post('/kitchen/items/:itemId/status', { preHandler: [app.requirePermission('kitchen:update')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { itemId } = req.params as { itemId: string };
    const { status } = parse(itemStatusSchema, req.body);
    const [item] = await app.db.select().from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.outletId, outletId)));
    if (!item) throw notFound('Order item');
    if (!ITEM_TRANSITIONS[item.status].includes(status)) throw conflict(`Cannot move item from ${item.status} to ${status}`);
    const stamp = status === 'PREPARING' ? { startedAt: new Date() }
      : status === 'READY' ? { readyAt: new Date() }
      : status === 'SERVED' ? { servedAt: new Date() } : {};
    // Compare-and-set on the previous status prevents two cooks clobbering each other.
    const [updated] = await app.db.update(orderItems).set({ status, ...stamp })
      .where(and(eq(orderItems.id, itemId), eq(orderItems.status, item.status))).returning();
    if (!updated) throw conflict('Item was updated by someone else; refresh and retry');
    app.realtime.emit(outletId, SOCKET_EVENTS.KITCHEN_UPDATED, { orderId: item.orderId });
    app.realtime.emit(outletId, SOCKET_EVENTS.ORDER_UPDATED, { id: item.orderId });
    return updated;
  });

  /** Bump a whole ticket: every queued/preparing item (optionally for one station) becomes READY. */
  app.post('/kitchen/orders/:orderId/bump', { preHandler: [app.requirePermission('kitchen:update')] }, async (req) => {
    const outletId = outletIdOf(req);
    const { orderId } = req.params as { orderId: string };
    const { station } = parse(stationQuery, req.body ?? {});
    const updated = await app.db.update(orderItems).set({ status: 'READY', readyAt: new Date() })
      .where(and(
        eq(orderItems.orderId, orderId), eq(orderItems.outletId, outletId),
        sql`${orderItems.status} in ('QUEUED','PREPARING')`,
        ...(station ? [eq(orderItems.station, station)] : []),
      )).returning({ id: orderItems.id });
    app.realtime.emit(outletId, SOCKET_EVENTS.KITCHEN_UPDATED, { orderId });
    app.realtime.emit(outletId, SOCKET_EVENTS.ORDER_UPDATED, { id: orderId });
    return { updated: updated.length };
  });
}
