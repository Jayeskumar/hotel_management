import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addStaff, makeApp, registerOrg, setupOutlet } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.close(); });

async function world() {
  const { owner, outletId } = await registerOrg(ctx.app);
  const s = await setupOutlet(owner, outletId);
  const waiter = await addStaff(ctx.app, owner, outletId, 'WAITER');
  const chef = await addStaff(ctx.app, owner, outletId, 'CHEF');
  const cashier = await addStaff(ctx.app, owner, outletId, 'CASHIER');
  return { owner, outletId, ...s, waiter: waiter.client, chef: chef.client, cashier: cashier.client };
}

describe('dine-in order lifecycle', () => {
  it('runs from seating to payment, kitchen and inventory', async () => {
    const w = await world();

    // Inventory + recipe
    const patty = (await w.owner.post(`${w.base}/inventory`, { name: 'Patty', unit: 'pcs', reorderLevel: 9, costPerUnitCents: 100 })).body;
    await w.owner.post(`${w.base}/inventory/${patty.id}/movements`, { delta: 10, reason: 'PURCHASE' });
    expect((await w.owner.put(`${w.base}/menu/items/${w.burger.id}/recipe`, { lines: [{ inventoryItemId: patty.id, quantity: 1 }] })).status).toBe(200);

    // Waiter seats the table
    const created = await w.waiter.post(`${w.base}/orders`, {
      type: 'DINE_IN', tableId: w.t1.id, guestCount: 2,
      items: [{ menuItemId: w.burger.id, quantity: 2, modifiers: ['Cheese'] }],
    });
    expect(created.status).toBe(201);
    const order = created.body;
    expect(order.orderNumber).toBe(1);
    // 2 x (1000 + 100) = 2200; service 5% = 110; tax 10% of 2310 = 231
    expect(order.subtotalCents).toBe(2200);
    expect(order.serviceChargeCents).toBe(110);
    expect(order.taxCents).toBe(231);
    expect(order.totalCents).toBe(2541);

    const floor = (await w.waiter.get(`${w.base}/floor`)).body;
    expect(floor.tables.find((t: any) => t.id === w.t1.id).status).toBe('OCCUPIED');

    // Table can't be double-seated
    expect((await w.waiter.post(`${w.base}/orders`, { type: 'DINE_IN', tableId: w.t1.id })).status).toBe(409);

    // Unknown modifier is rejected
    expect((await w.waiter.post(`${w.base}/orders/${order.id}/items`, {
      items: [{ menuItemId: w.soda.id, quantity: 1, modifiers: ['Cheese'] }],
    })).status).toBe(400);

    const added = await w.waiter.post(`${w.base}/orders/${order.id}/items`, { items: [{ menuItemId: w.soda.id, quantity: 1 }] });
    expect(added.body.items).toHaveLength(2);

    // Cannot pay with unsent items
    expect((await w.cashier.post(`${w.base}/orders/${order.id}/payments`, { method: 'CASH', amountCents: 100 })).status).toBe(409);

    // Fire to kitchen
    const fired = await w.waiter.post(`${w.base}/orders/${order.id}/fire`);
    expect(fired.body.items.every((i: any) => i.status === 'QUEUED')).toBe(true);
    expect((await w.waiter.post(`${w.base}/orders/${order.id}/fire`)).status).toBe(409);

    // KDS filtered by station
    const grill = (await w.chef.get(`${w.base}/kitchen?station=GRILL`)).body;
    expect(grill).toHaveLength(1);
    expect(grill[0].items).toHaveLength(1);
    expect(grill[0].tableLabel).toBe('T1');
    const burgerLine = grill[0].items[0];

    // Waiters can't drive the kitchen; invalid transitions are rejected
    expect((await w.waiter.post(`${w.base}/kitchen/items/${burgerLine.id}/status`, { status: 'PREPARING' })).status).toBe(403);
    expect((await w.chef.post(`${w.base}/kitchen/items/${burgerLine.id}/status`, { status: 'SERVED' })).status).toBe(409);
    expect((await w.chef.post(`${w.base}/kitchen/items/${burgerLine.id}/status`, { status: 'PREPARING' })).status).toBe(200);
    expect((await w.chef.post(`${w.base}/kitchen/orders/${order.id}/bump`, {})).body.updated).toBe(2);

    // Waiter serves the burger
    expect((await w.waiter.post(`${w.base}/orders/${order.id}/items/${burgerLine.id}/serve`)).status).toBe(200);

    // Waiter can't void a fired item; manager-level owner can
    const sodaLine = added.body.items.find((i: any) => i.name === 'Soda');
    expect((await w.waiter.post(`${w.base}/orders/${order.id}/items/${sodaLine.id}/void`, { reason: 'Spilled' })).status).toBe(403);
    const voided = await w.owner.post(`${w.base}/orders/${order.id}/items/${sodaLine.id}/void`, { reason: 'Guest changed mind' });
    expect(voided.status).toBe(200);
    expect(voided.body.totalCents).toBe(2541);

    // Split payment with idempotency
    const p1 = await w.cashier.post(`${w.base}/orders/${order.id}/payments`, { method: 'CARD', amountCents: 1000, idempotencyKey: 'key-abcdefgh' });
    expect(p1.status).toBe(201);
    expect(p1.body.balanceCents).toBe(1541);
    const replay = await w.cashier.post(`${w.base}/orders/${order.id}/payments`, { method: 'CARD', amountCents: 1000, idempotencyKey: 'key-abcdefgh' });
    expect(replay.status).toBe(200);
    expect(replay.body.payments).toHaveLength(1);

    expect((await w.cashier.post(`${w.base}/orders/${order.id}/payments`, { method: 'CASH', amountCents: 99999 })).status).toBe(400);
    expect((await w.waiter.post(`${w.base}/orders/${order.id}/payments`, { method: 'CASH', amountCents: 1541 })).status).toBe(403);

    const done = await w.cashier.post(`${w.base}/orders/${order.id}/payments`, { method: 'CASH', amountCents: 1541, tipCents: 200 });
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.tipCents).toBe(200);
    expect(done.body.balanceCents).toBe(0);

    // Table released for cleaning, inventory deducted (2 burgers)
    const floor2 = (await w.waiter.get(`${w.base}/floor`)).body;
    expect(floor2.tables.find((t: any) => t.id === w.t1.id).status).toBe('CLEANING');
    const inv = (await w.owner.get(`${w.base}/inventory`)).body;
    expect(inv[0].quantityOnHand).toBe(8);
    expect(inv[0].isLow).toBe(true);

    // Closed orders are immutable
    expect((await w.waiter.post(`${w.base}/orders/${order.id}/items`, { items: [{ menuItemId: w.soda.id, quantity: 1 }] })).status).toBe(409);

    // Audit trail captured the void and payments
    const audit = (await w.owner.get(`${w.base}/audit?entityId=${order.id}`)).body.data.map((a: any) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['order.created', 'order.item_voided', 'payment.captured', 'order.completed']));

    // Reports reflect the sale
    const report = (await w.owner.get(`${w.base}/reports/sales`)).body;
    expect(report.summary.orders).toBe(1);
    expect(report.summary.totalCents).toBe(2541);
    expect(report.summary.tipCents).toBe(200);
    expect(report.voids.count).toBe(1);
    expect(report.topItems[0].name).toBe('Burger');

    const csv = await w.owner.get(`${w.base}/reports/orders.csv`);
    expect(csv.status).toBe(200);
    expect(String(csv.body).split('\n')).toHaveLength(2);
  });

  it('handles takeaway orders, discounts, cancellations and refunds', async () => {
    const w = await world();
    const o = (await w.cashier.post(`${w.base}/orders`, {
      type: 'TAKEAWAY', customerName: 'Sam', items: [{ menuItemId: w.burger.id, quantity: 1 }],
    })).body;
    expect(o.serviceChargeCents).toBe(0);
    expect(o.totalCents).toBe(1100);

    // Cashier limited to 20% discount
    expect((await w.cashier.post(`${w.base}/orders/${o.id}/discount`, { discount: { type: 'PERCENT', bps: 5000 } })).status).toBe(403);
    const disc = await w.cashier.post(`${w.base}/orders/${o.id}/discount`, { discount: { type: 'PERCENT', bps: 1000 }, reason: 'Regular' });
    expect(disc.body.discountCents).toBe(100);
    expect(disc.body.totalCents).toBe(990);

    // Pending items can be edited and removed freely
    const line = disc.body.items[0];
    expect((await w.cashier.patch(`${w.base}/orders/${o.id}/items/${line.id}`, { quantity: 3 })).body.subtotalCents).toBe(3000);

    await w.cashier.post(`${w.base}/orders/${o.id}/fire`);
    await w.cashier.post(`${w.base}/orders/${o.id}/payments`, { method: 'CARD', amountCents: 500 });

    // Can't cancel with payments; manager refunds, then cancels
    expect((await w.owner.post(`${w.base}/orders/${o.id}/cancel`, { reason: 'Customer left' })).status).toBe(409);
    expect((await w.cashier.post(`${w.base}/orders/${o.id}/cancel`, { reason: 'Customer left' })).status).toBe(403);
    const detail = (await w.owner.get(`${w.base}/orders/${o.id}`)).body;
    const refunded = await w.owner.post(`${w.base}/orders/${o.id}/payments/${detail.payments[0].id}/refund`, { reason: 'Customer left' });
    expect(refunded.body.paidCents).toBe(0);
    const cancelled = await w.owner.post(`${w.base}/orders/${o.id}/cancel`, { reason: 'Customer left' });
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.items.every((i: any) => i.status === 'VOIDED')).toBe(true);

    const kds = (await w.chef.get(`${w.base}/kitchen`)).body;
    expect(kds).toHaveLength(0);
  });

  it('transfers tables and blocks unavailable items', async () => {
    const w = await world();
    const o = (await w.waiter.post(`${w.base}/orders`, { type: 'DINE_IN', tableId: w.t1.id })).body;
    const moved = await w.waiter.patch(`${w.base}/orders/${o.id}`, { tableId: w.t2.id });
    expect(moved.body.table.label).toBe('T2');
    const floor = (await w.waiter.get(`${w.base}/floor`)).body;
    expect(floor.tables.find((t: any) => t.id === w.t1.id).status).toBe('CLEANING');
    expect(floor.tables.find((t: any) => t.id === w.t2.id).status).toBe('OCCUPIED');

    // Chef 86's the soda
    expect((await w.chef.patch(`${w.base}/menu/items/${w.soda.id}/availability`, { isAvailable: false })).status).toBe(200);
    expect((await w.waiter.post(`${w.base}/orders/${o.id}/items`, { items: [{ menuItemId: w.soda.id, quantity: 1 }] })).status).toBe(409);
  });

  it('assigns unique order numbers under concurrency', async () => {
    const w = await world();
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      w.cashier.post(`${w.base}/orders`, { type: 'TAKEAWAY' })));
    const numbers = results.map((r) => r.body.orderNumber);
    expect(new Set(numbers).size).toBe(10);
  });

  it('prevents double-seating a table under concurrency', async () => {
    const w = await world();
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      w.waiter.post(`${w.base}/orders`, { type: 'DINE_IN', tableId: w.t1.id })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });
});

describe('reservations', () => {
  it('prevents overlapping bookings on a table', async () => {
    const w = await world();
    const at = new Date(Date.now() + 86_400_000);
    const body = { customerName: 'Ana', customerPhone: '555-1', partySize: 2, reservedFor: at.toISOString(), durationMin: 90, tableId: w.t1.id };
    const r1 = await w.waiter.post(`${w.base}/reservations`, body);
    expect(r1.status).toBe(201);
    const overlap = await w.waiter.post(`${w.base}/reservations`, { ...body, reservedFor: new Date(at.getTime() + 60 * 60_000).toISOString() });
    expect(overlap.status).toBe(409);
    const after = await w.waiter.post(`${w.base}/reservations`, { ...body, reservedFor: new Date(at.getTime() + 90 * 60_000).toISOString() });
    expect(after.status).toBe(201);
    expect((await w.waiter.post(`${w.base}/reservations`, { ...body, partySize: 10, tableId: w.t2.id })).status).toBe(400);

    expect((await w.waiter.patch(`${w.base}/reservations/${r1.body.id}/status`, { status: 'COMPLETED' })).status).toBe(409);
    expect((await w.waiter.patch(`${w.base}/reservations/${r1.body.id}/status`, { status: 'SEATED' })).status).toBe(200);
    const list = (await w.waiter.get(`${w.base}/reservations`)).body;
    expect(list).toHaveLength(2);
  });
});

describe('dashboard', () => {
  it('returns a live snapshot', async () => {
    const w = await world();
    await w.waiter.post(`${w.base}/orders`, { type: 'DINE_IN', tableId: w.t1.id, items: [{ menuItemId: w.burger.id, quantity: 1 }] });
    const d = (await w.waiter.get(`${w.base}/dashboard`)).body;
    expect(d.openOrders.count).toBe(1);
    expect(d.tables.total).toBe(2);
    expect(d.tables.byStatus.OCCUPIED).toBe(1);
  });
});
