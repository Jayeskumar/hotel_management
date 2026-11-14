import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { computeBill, type CreateOrderInput } from '@tablewise/shared';
import type { DB, Tx } from '../db/client.js';
import {
  diningTables, inventoryItems, menuItems, orderItems, orders, outlets, payments, recipeLines,
  stockMovements, type Modifier,
} from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

type Line = { menuItemId: string; quantity: number; modifiers: string[]; notes?: string | null };
type OrderRow = typeof orders.$inferSelect;

/** Locks the order row for the duration of the transaction and checks tenancy. */
export async function lockOrder(tx: Tx, outletId: string, orderId: string): Promise<OrderRow> {
  const [order] = await tx.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.outletId, outletId)))
    .for('update');
  if (!order) throw notFound('Order');
  return order;
}

export function assertOpen(order: OrderRow) {
  if (order.status !== 'OPEN') throw conflict(`Order is ${order.status.toLowerCase()}`);
}

/** Resolve requested lines against the live menu and snapshot name/price/tax/station. */
export async function buildLines(tx: Tx, outletId: string, outletTaxBps: number, lines: Line[], userId: string, orderId: string) {
  if (!lines.length) return [];
  const ids = [...new Set(lines.map((l) => l.menuItemId))];
  const menu = await tx.select().from(menuItems)
    .where(and(eq(menuItems.outletId, outletId), inArray(menuItems.id, ids)));
  const byId = new Map(menu.map((m) => [m.id, m]));
  return lines.map((l) => {
    const m = byId.get(l.menuItemId);
    if (!m || m.isArchived) throw badRequest('One or more menu items no longer exist');
    if (!m.isAvailable) throw conflict(`${m.name} is currently unavailable`);
    const mods: Modifier[] = l.modifiers.map((name) => {
      const mod = m.modifiers.find((x) => x.name === name);
      if (!mod) throw badRequest(`Unknown modifier "${name}" for ${m.name}`);
      return mod;
    });
    return {
      orderId,
      outletId,
      menuItemId: m.id,
      name: m.name,
      station: m.station,
      unitPriceCents: m.priceCents,
      modifiers: mods,
      modifiersCents: mods.reduce((a, x) => a + x.priceCents, 0),
      taxRateBps: m.taxRateBps ?? outletTaxBps,
      quantity: l.quantity,
      notes: l.notes ?? null,
      createdById: userId,
    } satisfies typeof orderItems.$inferInsert;
  });
}

/** Recompute and persist totals from the non-voided lines. Bumps the optimistic version. */
export async function recalc(tx: Tx, orderId: string): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw notFound('Order');
  const lines = await tx.select().from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, 'VOIDED')));
  const totals = computeBill({
    lines: lines.map((l) => ({
      unitPriceCents: l.unitPriceCents, quantity: l.quantity, taxRateBps: l.taxRateBps, modifiersCents: l.modifiersCents,
    })),
    discount: order.discount,
    serviceChargeBps: order.serviceChargeBps,
  });
  const [updated] = await tx.update(orders)
    .set({ ...totals, version: sql`${orders.version} + 1` })
    .where(eq(orders.id, orderId)).returning();
  return updated!;
}

export async function createOrder(db: DB, outletId: string, userId: string, input: CreateOrderInput) {
  return db.transaction(async (tx) => {
    const [outlet] = await tx.update(outlets)
      .set({ orderSeq: sql`${outlets.orderSeq} + 1` })
      .where(eq(outlets.id, outletId))
      .returning({ seq: outlets.orderSeq, taxRateBps: outlets.taxRateBps, serviceChargeBps: outlets.serviceChargeBps });
    if (!outlet) throw notFound('Outlet');

    let tableId: string | null = null;
    if (input.type === 'DINE_IN') {
      const [table] = await tx.select().from(diningTables)
        .where(and(eq(diningTables.id, input.tableId!), eq(diningTables.outletId, outletId), eq(diningTables.isActive, true)))
        .for('update');
      if (!table) throw notFound('Table');
      if (table.status === 'OUT_OF_SERVICE') throw conflict(`Table ${table.label} is out of service`);
      const open = await tx.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.tableId, table.id), eq(orders.status, 'OPEN')));
      if (open.length) throw conflict(`Table ${table.label} already has an open order`);
      await tx.update(diningTables).set({ status: 'OCCUPIED', statusChangedAt: new Date() }).where(eq(diningTables.id, table.id));
      tableId = table.id;
    }

    const [order] = await tx.insert(orders).values({
      outletId,
      orderNumber: outlet.seq,
      type: input.type,
      tableId,
      guestCount: input.guestCount,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      notes: input.notes ?? null,
      waiterId: userId,
      serviceChargeBps: input.type === 'DINE_IN' ? outlet.serviceChargeBps : 0,
    }).returning();

    const lines = await buildLines(tx, outletId, outlet.taxRateBps, input.items, userId, order!.id);
    if (lines.length) await tx.insert(orderItems).values(lines);
    return recalc(tx, order!.id);
  });
}

export async function addItems(tx: Tx, outletId: string, orderId: string, userId: string, lines: Line[]) {
  const order = await lockOrder(tx, outletId, orderId);
  assertOpen(order);
  const [outlet] = await tx.select({ taxRateBps: outlets.taxRateBps }).from(outlets).where(eq(outlets.id, outletId));
  const rows = await buildLines(tx, outletId, outlet!.taxRateBps, lines, userId, orderId);
  await tx.insert(orderItems).values(rows);
  return recalc(tx, orderId);
}

/** Send all unsent lines to the kitchen. */
export async function fireOrder(tx: Tx, outletId: string, orderId: string) {
  const order = await lockOrder(tx, outletId, orderId);
  assertOpen(order);
  const fired = await tx.update(orderItems)
    .set({ status: 'QUEUED', firedAt: new Date() })
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, 'PENDING')))
    .returning({ id: orderItems.id });
  if (!fired.length) throw conflict('There are no new items to send');
  await recalc(tx, orderId);
  return fired.length;
}

export async function balanceDue(order: OrderRow) {
  return Math.max(0, order.totalCents - order.paidCents);
}

/** Deduct recipe ingredients for every non-voided line. Returns inventory items now at/below reorder level. */
export async function deductInventory(tx: Tx, outletId: string, orderId: string, userId: string) {
  const usage = await tx.select({
    inventoryItemId: recipeLines.inventoryItemId,
    qty: sql<string>`sum(${recipeLines.quantity} * ${orderItems.quantity})`,
  }).from(orderItems)
    .innerJoin(recipeLines, eq(recipeLines.menuItemId, orderItems.menuItemId))
    .where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, 'VOIDED')))
    .groupBy(recipeLines.inventoryItemId);
  if (!usage.length) return [];
  for (const u of usage) {
    const qty = Number(u.qty);
    await tx.update(inventoryItems)
      .set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} - ${qty}` })
      .where(and(eq(inventoryItems.id, u.inventoryItemId), eq(inventoryItems.outletId, outletId)));
    await tx.insert(stockMovements).values({
      inventoryItemId: u.inventoryItemId, outletId, delta: -qty, reason: 'USAGE', orderId, createdById: userId,
    });
  }
  return tx.select({ id: inventoryItems.id, name: inventoryItems.name, quantityOnHand: inventoryItems.quantityOnHand })
    .from(inventoryItems)
    .where(and(
      inArray(inventoryItems.id, usage.map((u) => u.inventoryItemId)),
      sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`,
    ));
}

/** Release the table after an order closes so it can be bussed. */
export async function releaseTable(tx: Tx, order: OrderRow) {
  if (!order.tableId) return;
  await tx.update(diningTables).set({ status: 'CLEANING', statusChangedAt: new Date() })
    .where(eq(diningTables.id, order.tableId));
}

export async function getOrderDetail(db: DB | Tx, outletId: string, orderId: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.outletId, outletId)));
  if (!order) throw notFound('Order');
  const [items, pays, table] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.createdAt),
    db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(payments.createdAt),
    order.tableId
      ? db.select({ id: diningTables.id, label: diningTables.label }).from(diningTables).where(eq(diningTables.id, order.tableId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { ...order, table, items, payments: pays, balanceCents: Math.max(0, order.totalCents - order.paidCents) };
}
