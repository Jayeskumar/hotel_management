import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  auditLogs, diningTables, inventoryItems, menuCategories, menuItems, orderItems, orders, outlets, payments,
  reservations, users,
} from '../db/schema.js';
import { parse } from '../lib/validate.js';
import { outletIdOf, paged } from '../lib/http.js';
import { paginationSchema } from '@tablewise/shared';

const rangeQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

function range(q: z.infer<typeof rangeQuery>) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * 86_400_000);
  return { from, to };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection and quote as needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export default async function reportRoutes(app: FastifyInstance) {
  const reports = { preHandler: [app.requirePermission('reports:view')] };

  async function tz(outletId: string) {
    const [o] = await app.db.select({ timezone: outlets.timezone }).from(outlets).where(eq(outlets.id, outletId));
    return o?.timezone ?? 'UTC';
  }

  /** Live operational snapshot for the dashboard. */
  app.get('/dashboard', async (req) => {
    const outletId = outletIdOf(req);
    const zone = await tz(outletId);
    const dayStart = sql`(date_trunc('day', now() at time zone ${zone}) at time zone ${zone})`;
    const [[sales], [open], tables, [kitchen], upcoming, [low]] = await Promise.all([
      app.db.select({
        salesCents: sql<number>`coalesce(sum(${orders.totalCents}),0)::int`,
        orders: sql<number>`count(*)::int`,
        guests: sql<number>`coalesce(sum(${orders.guestCount}),0)::int`,
      }).from(orders).where(and(eq(orders.outletId, outletId), eq(orders.status, 'COMPLETED'), gte(orders.closedAt, dayStart))),
      app.db.select({ count: sql<number>`count(*)::int`, valueCents: sql<number>`coalesce(sum(${orders.totalCents}),0)::int` })
        .from(orders).where(and(eq(orders.outletId, outletId), eq(orders.status, 'OPEN'))),
      app.db.select({ status: diningTables.status, count: sql<number>`count(*)::int` }).from(diningTables)
        .where(and(eq(diningTables.outletId, outletId), eq(diningTables.isActive, true))).groupBy(diningTables.status),
      app.db.select({ count: sql<number>`count(*)::int` }).from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orderItems.outletId, outletId), eq(orders.status, 'OPEN'), inArray(orderItems.status, ['QUEUED', 'PREPARING']))),
      app.db.select().from(reservations).where(and(
        eq(reservations.outletId, outletId), eq(reservations.status, 'BOOKED'),
        gte(reservations.reservedFor, sql`now() - interval '30 minutes'`),
        lt(reservations.reservedFor, sql`now() + interval '4 hours'`),
      )).orderBy(reservations.reservedFor).limit(10),
      app.db.select({ count: sql<number>`count(*)::int` }).from(inventoryItems)
        .where(and(eq(inventoryItems.outletId, outletId), sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`)),
    ]);
    const tableCounts = Object.fromEntries(tables.map((t) => [t.status, t.count]));
    return {
      today: { ...sales!, avgOrderCents: sales!.orders ? Math.round(sales!.salesCents / sales!.orders) : 0 },
      openOrders: open,
      tables: { total: tables.reduce((a, t) => a + t.count, 0), byStatus: tableCounts },
      kitchenQueue: kitchen!.count,
      upcomingReservations: upcoming,
      lowStockCount: low!.count,
    };
  });

  app.get('/reports/sales', reports, async (req) => {
    const outletId = outletIdOf(req);
    const { from, to } = range(parse(rangeQuery, req.query));
    const zone = await tz(outletId);
    const completed = and(eq(orders.outletId, outletId), eq(orders.status, 'COMPLETED'), gte(orders.closedAt, from), lt(orders.closedAt, to));

    const [[summary], byDay, byHour, byType, byMethod, topItems, byCategory, byStaff, [voids], [cancelled], [refunds]] = await Promise.all([
      app.db.select({
        orders: sql<number>`count(*)::int`,
        grossCents: sql<number>`coalesce(sum(${orders.subtotalCents}),0)::int`,
        discountCents: sql<number>`coalesce(sum(${orders.discountCents}),0)::int`,
        serviceChargeCents: sql<number>`coalesce(sum(${orders.serviceChargeCents}),0)::int`,
        taxCents: sql<number>`coalesce(sum(${orders.taxCents}),0)::int`,
        totalCents: sql<number>`coalesce(sum(${orders.totalCents}),0)::int`,
        tipCents: sql<number>`coalesce(sum(${orders.tipCents}),0)::int`,
        guests: sql<number>`coalesce(sum(${orders.guestCount}),0)::int`,
        avgTurnMin: sql<number>`coalesce(avg(extract(epoch from (${orders.closedAt} - ${orders.openedAt})) / 60) filter (where ${orders.type} = 'DINE_IN'),0)::float`,
      }).from(orders).where(completed),
      app.db.select({
        day: sql<string>`to_char(${orders.closedAt} at time zone ${zone}, 'YYYY-MM-DD')`,
        totalCents: sql<number>`sum(${orders.totalCents})::int`,
        orders: sql<number>`count(*)::int`,
      }).from(orders).where(completed).groupBy(sql`1`).orderBy(sql`1`),
      app.db.select({
        hour: sql<number>`extract(hour from ${orders.openedAt} at time zone ${zone})::int`,
        totalCents: sql<number>`sum(${orders.totalCents})::int`,
        orders: sql<number>`count(*)::int`,
      }).from(orders).where(completed).groupBy(sql`1`).orderBy(sql`1`),
      app.db.select({ type: orders.type, totalCents: sql<number>`sum(${orders.totalCents})::int`, orders: sql<number>`count(*)::int` })
        .from(orders).where(completed).groupBy(orders.type),
      app.db.select({ method: payments.method, amountCents: sql<number>`sum(${payments.amountCents})::int`, count: sql<number>`count(*)::int` })
        .from(payments).where(and(eq(payments.outletId, outletId), eq(payments.status, 'COMPLETED'), gte(payments.createdAt, from), lt(payments.createdAt, to)))
        .groupBy(payments.method),
      app.db.select({
        name: orderItems.name,
        quantity: sql<number>`sum(${orderItems.quantity})::int`,
        revenueCents: sql<number>`sum((${orderItems.unitPriceCents} + ${orderItems.modifiersCents}) * ${orderItems.quantity})::int`,
      }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(completed, sql`${orderItems.status} <> 'VOIDED'`))
        .groupBy(orderItems.name).orderBy(desc(sql`2`)).limit(10),
      app.db.select({
        category: sql<string>`coalesce(${menuCategories.name}, 'Uncategorised')`,
        revenueCents: sql<number>`sum((${orderItems.unitPriceCents} + ${orderItems.modifiersCents}) * ${orderItems.quantity})::int`,
      }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
        .leftJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
        .leftJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
        .where(and(completed, sql`${orderItems.status} <> 'VOIDED'`))
        .groupBy(sql`1`).orderBy(desc(sql`2`)),
      app.db.select({
        name: sql<string>`coalesce(${users.name}, 'Unknown')`,
        orders: sql<number>`count(*)::int`,
        totalCents: sql<number>`sum(${orders.totalCents})::int`,
        tipCents: sql<number>`sum(${orders.tipCents})::int`,
      }).from(orders).leftJoin(users, eq(users.id, orders.waiterId)).where(completed).groupBy(sql`1`).orderBy(desc(sql`3`)),
      app.db.select({
        count: sql<number>`count(*)::int`,
        valueCents: sql<number>`coalesce(sum((${orderItems.unitPriceCents} + ${orderItems.modifiersCents}) * ${orderItems.quantity}),0)::int`,
      }).from(orderItems).where(and(
        eq(orderItems.outletId, outletId), eq(orderItems.status, 'VOIDED'),
        gte(orderItems.updatedAt, from), lt(orderItems.updatedAt, to),
        sql`${orderItems.voidReason} not like 'Order cancelled:%'`,
      )),
      app.db.select({ count: sql<number>`count(*)::int` }).from(orders)
        .where(and(eq(orders.outletId, outletId), eq(orders.status, 'CANCELLED'), gte(orders.closedAt, from), lt(orders.closedAt, to))),
      app.db.select({ count: sql<number>`count(*)::int`, amountCents: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` })
        .from(payments).where(and(eq(payments.outletId, outletId), eq(payments.status, 'REFUNDED'), gte(payments.refundedAt, from), lt(payments.refundedAt, to))),
    ]);

    return {
      range: { from, to, timezone: zone },
      summary: {
        ...summary!,
        netSalesCents: summary!.grossCents - summary!.discountCents,
        avgOrderCents: summary!.orders ? Math.round(summary!.totalCents / summary!.orders) : 0,
        avgTurnMin: Math.round(summary!.avgTurnMin),
      },
      byDay, byHour, byType, byMethod, topItems, byCategory, byStaff,
      voids, cancelledOrders: cancelled!.count, refunds,
    };
  });

  app.get('/reports/orders.csv', reports, async (req, reply) => {
    const outletId = outletIdOf(req);
    const { from, to } = range(parse(rangeQuery, req.query));
    const rows = await app.db.select({ o: orders, table: diningTables.label, waiter: users.name }).from(orders)
      .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
      .leftJoin(users, eq(users.id, orders.waiterId))
      .where(and(eq(orders.outletId, outletId), gte(orders.openedAt, from), lt(orders.openedAt, to)))
      .orderBy(orders.openedAt).limit(50_000);
    const header = ['order_number', 'status', 'type', 'table', 'waiter', 'guests', 'opened_at', 'closed_at',
      'subtotal', 'discount', 'service_charge', 'tax', 'total', 'paid', 'tip', 'customer_name'];
    const money = (c: number) => (c / 100).toFixed(2);
    const lines = rows.map(({ o, table, waiter }) => [
      o.orderNumber, o.status, o.type, table, waiter, o.guestCount, o.openedAt.toISOString(), o.closedAt?.toISOString(),
      money(o.subtotalCents), money(o.discountCents), money(o.serviceChargeCents), money(o.taxCents),
      money(o.totalCents), money(o.paidCents), money(o.tipCents), o.customerName,
    ].map(csvCell).join(','));
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="orders-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`);
    return [header.join(','), ...lines].join('\n');
  });

  app.get('/audit', { preHandler: [app.requirePermission('audit:view')] }, async (req) => {
    const outletId = outletIdOf(req);
    const q = parse(paginationSchema.extend({ entityId: z.string().uuid().optional() }), req.query);
    const cond = and(
      eq(auditLogs.organizationId, req.user.org), eq(auditLogs.outletId, outletId),
      ...(q.entityId ? [eq(auditLogs.entityId, q.entityId)] : []),
    );
    const [rows, [{ count } = { count: 0 }]] = await Promise.all([
      app.db.select({ log: auditLogs, userName: users.name }).from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(cond).orderBy(desc(auditLogs.createdAt))
        .limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      app.db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(cond),
    ]);
    return paged(rows.map((r) => ({ ...r.log, userName: r.userName })), count, q.page, q.pageSize);
  });
}
