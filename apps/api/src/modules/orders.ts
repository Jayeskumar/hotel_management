import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  addItemsSchema, cancelOrderSchema, can, createOrderSchema, discountSchema, ITEM_TRANSITIONS,
  itemStatusSchema, ORDER_STATUSES, ORDER_TYPES, paginationSchema, paymentSchema, refundSchema,
  SOCKET_EVENTS, updateItemQtySchema, updateOrderSchema, voidItemSchema,
} from '@tablewise/shared';
import { diningTables, orderItems, orders, payments, users } from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { outletIdOf, paged } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import {
  addItems, assertOpen, createOrder, deductInventory, fireOrder, getOrderDetail, lockOrder, recalc, releaseTable,
} from './orders.service.js';

const listQuery = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  type: z.enum(ORDER_TYPES).optional(),
  q: z.string().trim().max(60).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export default async function orderRoutes(app: FastifyInstance) {
  const perm = (p: Parameters<typeof app.requirePermission>[0]) => ({ preHandler: [app.requirePermission(p)] });

  function notify(outletId: string, orderId: string, opts: { kitchen?: boolean; table?: boolean } = {}) {
    app.realtime.emit(outletId, SOCKET_EVENTS.ORDER_UPDATED, { id: orderId });
    if (opts.kitchen) app.realtime.emit(outletId, SOCKET_EVENTS.KITCHEN_UPDATED, { orderId });
    if (opts.table) app.realtime.emit(outletId, SOCKET_EVENTS.TABLE_UPDATED, {});
  }

  const params = (req: FastifyRequest) => req.params as { id: string; itemId: string; paymentId: string };

  app.get('/orders', perm('orders:view'), async (req) => {
    const outletId = outletIdOf(req);
    const q = parse(listQuery, req.query);
    const where: SQL[] = [eq(orders.outletId, outletId)];
    if (q.status) where.push(eq(orders.status, q.status));
    if (q.type) where.push(eq(orders.type, q.type));
    if (q.from) where.push(gte(orders.openedAt, new Date(q.from)));
    if (q.to) where.push(lte(orders.openedAt, new Date(q.to)));
    if (q.q) {
      const n = Number(q.q.replace(/^#/, ''));
      const term = `%${q.q.replace(/[%_]/g, '')}%`;
      where.push(or(
        ilike(orders.customerName, term), ilike(orders.customerPhone, term),
        ...(Number.isInteger(n) && n > 0 ? [eq(orders.orderNumber, n)] : []),
      )!);
    }
    const cond = and(...where);
    const [rows, [{ count } = { count: 0 }]] = await Promise.all([
      app.db.select({
        order: orders, tableLabel: diningTables.label, waiterName: users.name,
      }).from(orders)
        .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
        .leftJoin(users, eq(users.id, orders.waiterId))
        .where(cond).orderBy(desc(orders.openedAt))
        .limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      app.db.select({ count: sql<number>`count(*)::int` }).from(orders).where(cond),
    ]);
    return paged(rows.map((r) => ({ ...r.order, tableLabel: r.tableLabel, waiterName: r.waiterName })), count, q.page, q.pageSize);
  });

  app.get('/orders/:id', perm('orders:view'), async (req) => getOrderDetail(app.db, outletIdOf(req), params(req).id));

  app.post('/orders', perm('orders:create'), async (req, reply) => {
    const outletId = outletIdOf(req);
    const input = parse(createOrderSchema, req.body);
    const order = await createOrder(app.db, outletId, req.user.sub, input);
    await audit(app.db, req, {
      action: 'order.created', entityType: 'order', entityId: order.id, outletId,
      metadata: { orderNumber: order.orderNumber, type: order.type },
    });
    notify(outletId, order.id, { table: !!order.tableId });
    reply.code(201);
    return getOrderDetail(app.db, outletId, order.id);
  });

  app.patch('/orders/:id', perm('orders:update'), async (req) => {
    const outletId = outletIdOf(req);
    const { id } = params(req);
    const input = parse(updateOrderSchema, req.body);
    await app.db.transaction(async (tx) => {
      const order = await lockOrder(tx, outletId, id);
      assertOpen(order);
      const patch: Partial<typeof orders.$inferInsert> = {};
      if (input.guestCount !== undefined) patch.guestCount = input.guestCount;
      if (input.customerName !== undefined) patch.customerName = input.customerName;
      if (input.customerPhone !== undefined) patch.customerPhone = input.customerPhone;
      if (input.notes !== undefined) patch.notes = input.notes;
      // Table transfer for dine-in orders.
      if (input.tableId !== undefined && input.tableId !== order.tableId) {
        if (order.type !== 'DINE_IN' || !input.tableId) throw badRequest('Only dine-in orders can be moved between tables');
        const [target] = await tx.select().from(diningTables)
          .where(and(eq(diningTables.id, input.tableId), eq(diningTables.outletId, outletId), eq(diningTables.isActive, true)))
          .for('update');
        if (!target) throw notFound('Table');
        const busy = await tx.select({ id: orders.id }).from(orders)
          .where(and(eq(orders.tableId, target.id), eq(orders.status, 'OPEN')));
        if (busy.length) throw conflict(`Table ${target.label} already has an open order`);
        await releaseTable(tx, order);
        await tx.update(diningTables).set({ status: 'OCCUPIED', statusChangedAt: new Date() }).where(eq(diningTables.id, target.id));
        patch.tableId = target.id;
        await audit(tx, req, { action: 'order.table_transferred', entityType: 'order', entityId: id, outletId, metadata: { from: order.tableId, to: target.id } });
      }
      if (Object.keys(patch).length) await tx.update(orders).set({ ...patch, version: sql`${orders.version} + 1` }).where(eq(orders.id, id));
    });
    notify(outletId, id, { table: input.tableId !== undefined });
    return getOrderDetail(app.db, outletId, id);
  });

  // ------------------------------------------------------------ Items
  app.post('/orders/:id/items', perm('orders:update'), async (req) => {
    const outletId = outletIdOf(req);
    const { id } = params(req);
    const { items } = parse(addItemsSchema, req.body);
    await app.db.transaction((tx) => addItems(tx, outletId, id, req.user.sub, items));
    notify(outletId, id);
    return getOrderDetail(app.db, outletId, id);
  });

  app.patch('/orders/:id/items/:itemId', perm('orders:update'), async (req) => {
    const outletId = outletIdOf(req);
    const { id, itemId } = params(req);
    const { quantity } = parse(updateItemQtySchema, req.body);
    await app.db.transaction(async (tx) => {
      const order = await lockOrder(tx, outletId, id);
      assertOpen(order);
      const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)));
      if (!item) throw notFound('Order item');
      if (item.status !== 'PENDING') throw conflict('Items already sent to the kitchen cannot be changed; void instead');
      await tx.update(orderItems).set({ quantity }).where(eq(orderItems.id, itemId));
      await recalc(tx, id);
    });
    notify(outletId, id);
    return getOrderDetail(app.db, outletId, id);
  });

  /** Remove an unsent line, or void a fired line (requires orders:void_item and a reason). */
  app.post('/orders/:id/items/:itemId/void', perm('orders:update'), async (req) => {
    const outletId = outletIdOf(req);
    const { id, itemId } = params(req);
    let kitchen = false;
    await app.db.transaction(async (tx) => {
      const order = await lockOrder(tx, outletId, id);
      assertOpen(order);
      const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)));
      if (!item) throw notFound('Order item');
      if (item.status === 'VOIDED') throw conflict('Item is already voided');
      if (item.status === 'PENDING') {
        await tx.delete(orderItems).where(eq(orderItems.id, itemId));
      } else {
        if (!can(req.user.role, 'orders:void_item')) throw forbidden('Voiding a sent item requires manager approval');
        const { reason } = parse(voidItemSchema, req.body);
        await tx.update(orderItems).set({ status: 'VOIDED', voidReason: reason }).where(eq(orderItems.id, itemId));
        await audit(tx, req, {
          action: 'order.item_voided', entityType: 'order', entityId: id, outletId,
          metadata: { itemId, name: item.name, quantity: item.quantity, reason, valueCents: (item.unitPriceCents + item.modifiersCents) * item.quantity },
        });
        kitchen = true;
      }
      const updated = await recalc(tx, id);
      if (updated.paidCents > updated.totalCents) throw conflict('Cannot void below the amount already paid; refund first');
    });
    notify(outletId, id, { kitchen });
    return getOrderDetail(app.db, outletId, id);
  });

  app.post('/orders/:id/fire', perm('orders:update'), async (req) => {
    const outletId = outletIdOf(req);
    const { id } = params(req);
    const count = await app.db.transaction((tx) => fireOrder(tx, outletId, id));
    await audit(app.db, req, { action: 'order.fired', entityType: 'order', entityId: id, outletId, metadata: { items: count } });
    notify(outletId, id, { kitchen: true });
    return getOrderDetail(app.db, outletId, id);
  });

  /** Waiter marks a READY item as served (kitchen transitions live in the kitchen module). */
  app.post('/orders/:id/items/:itemId/serve', perm('orders:update'), async (req) => {
    const outletId = outletIdOf(req);
    const { id, itemId } = params(req);
    const [item] = await app.db.update(orderItems).set({ status: 'SERVED', servedAt: new Date() })
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id), eq(orderItems.outletId, outletId), eq(orderItems.status, 'READY')))
      .returning();
    if (!item) throw conflict('Only items that are ready can be marked served');
    notify(outletId, id, { kitchen: true });
    return getOrderDetail(app.db, outletId, id);
  });

  app.post('/orders/:id/discount', perm('orders:discount'), async (req) => {
    const outletId = outletIdOf(req);
    const { id } = params(req);
    const input = parse(discountSchema, req.body);
    await app.db.transaction(async (tx) => {
      const order = await lockOrder(tx, outletId, id);
      assertOpen(order);
      // Cashiers may discount up to 20%; larger discounts need a manager.
      if (input.discount && !can(req.user.role, 'orders:void_item')) {
        const pct = input.discount.type === 'PERCENT' ? input.discount.bps : (input.discount.amountCents / Math.max(1, order.subtotalCents)) * 10_000;
        if (pct > 2000) throw forbidden('Discounts above 20% require a manager');
      }
      await tx.update(orders).set({ discount: input.discount, discountReason: input.reason ?? null }).where(eq(orders.id, id));
      const updated = await recalc(tx, id);
      if (updated.paidCents > updated.totalCents) throw conflict('Discount would bring the total below the amount already paid');
      await audit(tx, req, { action: 'order.discount_applied', entityType: 'order', entityId: id, outletId, metadata: { ...input, discountCents: updated.discountCents } });
    });
    notify(outletId, id);
    return getOrderDetail(app.db, outletId, id);
  });

  app.post('/orders/:id/cancel', perm('orders:cancel'), async (req) => {
    const outletId = outletIdOf(req);
    const { id } = params(req);
    const { reason } = parse(cancelOrderSchema, req.body);
    await app.db.transaction(async (tx) => {
      const order = await lockOrder(tx, outletId, id);
      assertOpen(order);
      if (order.paidCents > 0) throw conflict('Refund payments before cancelling this order');
      await tx.update(orderItems).set({ status: 'VOIDED', voidReason: `Order cancelled: ${reason}` })
        .where(and(eq(orderItems.orderId, id), sql`${orderItems.status} <> 'VOIDED'`));
      await tx.update(orders).set({ status: 'CANCELLED', cancelReason: reason, closedAt: new Date() }).where(eq(orders.id, id));
      await recalc(tx, id);
      await releaseTable(tx, order);
      await audit(tx, req, { action: 'order.cancelled', entityType: 'order', entityId: id, outletId, metadata: { reason, totalCents: order.totalCents } });
    });
    notify(outletId, id, { kitchen: true, table: true });
    return getOrderDetail(app.db, outletId, id);
  });

  // ------------------------------------------------------------ Payments
  app.post('/orders/:id/payments', perm('payments:create'), async (req, reply) => {
    const outletId = outletIdOf(req);
    const { id } = params(req);
    const input = parse(paymentSchema, req.body);

    const result = await app.db.transaction(async (tx) => {
      const order = await lockOrder(tx, outletId, id);
      if (input.idempotencyKey) {
        const [existing] = await tx.select().from(payments)
          .where(and(eq(payments.outletId, outletId), eq(payments.idempotencyKey, input.idempotencyKey)));
        if (existing) {
          if (existing.orderId !== id) throw conflict('Idempotency key already used for a different order');
          return { replay: true, lowStock: [] as { id: string; name: string; quantityOnHand: number }[], closed: false };
        }
      }
      assertOpen(order);
      const pending = await tx.select({ id: orderItems.id }).from(orderItems)
        .where(and(eq(orderItems.orderId, id), eq(orderItems.status, 'PENDING'))).limit(1);
      if (pending.length) throw conflict('Send or remove unsent items before taking payment');
      const balance = order.totalCents - order.paidCents;
      if (balance <= 0) throw conflict('Nothing left to pay on this order');
      if (input.amountCents > balance) throw badRequest(`Amount exceeds balance due (${balance})`);

      await tx.insert(payments).values({
        orderId: id, outletId, method: input.method, amountCents: input.amountCents, tipCents: input.tipCents,
        reference: input.reference ?? null, idempotencyKey: input.idempotencyKey ?? null, createdById: req.user.sub,
      });
      const paidCents = order.paidCents + input.amountCents;
      const closed = paidCents >= order.totalCents;
      await tx.update(orders).set({
        paidCents,
        tipCents: order.tipCents + input.tipCents,
        version: sql`${orders.version} + 1`,
        ...(closed ? { status: 'COMPLETED' as const, closedAt: new Date() } : {}),
      }).where(eq(orders.id, id));
      await audit(tx, req, {
        action: 'payment.captured', entityType: 'order', entityId: id, outletId,
        metadata: { method: input.method, amountCents: input.amountCents, tipCents: input.tipCents },
      });
      let lowStock: { id: string; name: string; quantityOnHand: number }[] = [];
      if (closed) {
        // Items not yet served are treated as served on settlement.
        await tx.update(orderItems).set({ status: 'SERVED', servedAt: new Date() })
          .where(and(eq(orderItems.orderId, id), sql`${orderItems.status} in ('QUEUED','PREPARING','READY')`));
        await releaseTable(tx, order);
        lowStock = await deductInventory(tx, outletId, id, req.user.sub);
        await audit(tx, req, { action: 'order.completed', entityType: 'order', entityId: id, outletId, metadata: { totalCents: order.totalCents } });
      }
      return { replay: false, lowStock, closed };
    });

    if (!result.replay) {
      notify(outletId, id, { kitchen: result.closed, table: result.closed });
      if (result.lowStock.length) app.realtime.emit(outletId, SOCKET_EVENTS.INVENTORY_LOW, result.lowStock);
      reply.code(201);
    }
    return getOrderDetail(app.db, outletId, id);
  });

  app.post('/orders/:id/payments/:paymentId/refund', perm('payments:refund'), async (req) => {
    const outletId = outletIdOf(req);
    const { id, paymentId } = params(req);
    const { reason } = parse(refundSchema, req.body);
    await app.db.transaction(async (tx) => {
      const order = await lockOrder(tx, outletId, id);
      const [p] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.orderId, id)));
      if (!p) throw notFound('Payment');
      if (p.status === 'REFUNDED') throw conflict('Payment already refunded');
      await tx.update(payments).set({ status: 'REFUNDED', refundReason: reason, refundedAt: new Date() }).where(eq(payments.id, paymentId));
      await tx.update(orders).set({
        paidCents: order.paidCents - p.amountCents,
        tipCents: Math.max(0, order.tipCents - p.tipCents),
        version: sql`${orders.version} + 1`,
      }).where(eq(orders.id, id));
      await audit(tx, req, {
        action: 'payment.refunded', entityType: 'order', entityId: id, outletId,
        metadata: { paymentId, amountCents: p.amountCents, method: p.method, reason },
      });
    });
    notify(outletId, id);
    return getOrderDetail(app.db, outletId, id);
  });

  // Kitchen status transitions validated here too, for clients that use the order screen.
  app.post('/orders/:id/items/:itemId/status', perm('kitchen:update'), async (req) => {
    const outletId = outletIdOf(req);
    const { id, itemId } = params(req);
    const { status } = parse(itemStatusSchema, req.body);
    const [item] = await app.db.select().from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id), eq(orderItems.outletId, outletId)));
    if (!item) throw notFound('Order item');
    if (!ITEM_TRANSITIONS[item.status].includes(status)) throw conflict(`Cannot move item from ${item.status} to ${status}`);
    const stamp = status === 'PREPARING' ? { startedAt: new Date() } : status === 'READY' ? { readyAt: new Date() } : status === 'SERVED' ? { servedAt: new Date() } : {};
    await app.db.update(orderItems).set({ status, ...stamp })
      .where(and(eq(orderItems.id, itemId), eq(orderItems.status, item.status)));
    notify(outletId, id, { kitchen: true });
    return getOrderDetail(app.db, outletId, id);
  });
}
