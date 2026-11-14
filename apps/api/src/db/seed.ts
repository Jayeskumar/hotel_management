/**
 * Seeds a demo organization. Idempotent: refuses to run if the demo org exists.
 * Usage: npm run db:seed  (set SEED_HISTORY_DAYS=0 to skip historical orders)
 */
import { eq } from 'drizzle-orm';
import { computeBill } from '@tablewise/shared';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import {
  areas, diningTables, inventoryItems, menuCategories, menuItems, orderItems, orders, organizations, outlets,
  payments, recipeLines, reservations, userOutlets, users,
} from './schema.js';
import { hashPassword } from '../lib/password.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
await runMigrations(url);
const { db, pool } = createDb(url, 2);

const DEMO_SLUG = 'demo-restaurant-group';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123';
const HISTORY_DAYS = Number(process.env.SEED_HISTORY_DAYS ?? 14);

const existing = await db.select().from(organizations).where(eq(organizations.slug, DEMO_SLUG));
if (existing.length) {
  console.log('Demo organization already exists; skipping seed.');
  await pool.end();
  process.exit(0);
}

let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;

await db.transaction(async (tx) => {
  const [org] = await tx.insert(organizations).values({ name: 'Demo Restaurant Group', slug: DEMO_SLUG, plan: 'enterprise' }).returning();
  const [outlet] = await tx.insert(outlets).values({
    organizationId: org!.id, name: 'Downtown Bistro', address: '12 Market Street', phone: '+1 555 0100',
    currency: 'USD', timezone: 'America/New_York', taxRateBps: 800, serviceChargeBps: 1000,
    receiptFooter: 'Thank you for dining with us!',
  }).returning();
  const [outlet2] = await tx.insert(outlets).values({
    organizationId: org!.id, name: 'Uptown Express', currency: 'USD', timezone: 'America/New_York', taxRateBps: 800,
  }).returning();

  const hash = await hashPassword(PASSWORD);
  const staff = [
    { name: 'Olivia Owner', email: 'owner@demo.tablewise.app', role: 'OWNER' as const },
    { name: 'Marco Manager', email: 'manager@demo.tablewise.app', role: 'MANAGER' as const },
    { name: 'Cara Cashier', email: 'cashier@demo.tablewise.app', role: 'CASHIER' as const },
    { name: 'Will Waiter', email: 'waiter@demo.tablewise.app', role: 'WAITER' as const },
    { name: 'Wendy Waiter', email: 'waiter2@demo.tablewise.app', role: 'WAITER' as const },
    { name: 'Chen Chef', email: 'chef@demo.tablewise.app', role: 'CHEF' as const },
  ];
  const userRows = await tx.insert(users).values(staff.map((s) => ({ ...s, organizationId: org!.id, passwordHash: hash }))).returning();
  await tx.insert(userOutlets).values(userRows.map((u) => ({ userId: u.id, outletId: outlet!.id })));
  await tx.insert(userOutlets).values({ userId: userRows[0]!.id, outletId: outlet2!.id });
  const waiters = userRows.filter((u) => u.role === 'WAITER');

  // Floor
  const [main, patio, bar] = await tx.insert(areas).values([
    { outletId: outlet!.id, name: 'Main Hall', sortOrder: 0 },
    { outletId: outlet!.id, name: 'Patio', sortOrder: 1 },
    { outletId: outlet!.id, name: 'Bar', sortOrder: 2 },
  ]).returning();
  const tableDefs = [
    ...Array.from({ length: 8 }, (_, i) => ({ areaId: main!.id, label: `T${i + 1}`, seats: i < 4 ? 2 : 4, posX: (i % 4) * 25, posY: Math.floor(i / 4) * 40 })),
    ...Array.from({ length: 4 }, (_, i) => ({ areaId: patio!.id, label: `P${i + 1}`, seats: 6, shape: 'ROUND', posX: i * 25, posY: 0 })),
    ...Array.from({ length: 3 }, (_, i) => ({ areaId: bar!.id, label: `B${i + 1}`, seats: 2, shape: 'ROUND', posX: i * 30, posY: 0 })),
  ];
  const tables = await tx.insert(diningTables).values(tableDefs.map((t) => ({ ...t, outletId: outlet!.id }))).returning();

  // Inventory
  const inv = await tx.insert(inventoryItems).values([
    { name: 'Beef patty', unit: 'pcs', quantityOnHand: 120, reorderLevel: 30, costPerUnitCents: 180 },
    { name: 'Burger bun', unit: 'pcs', quantityOnHand: 150, reorderLevel: 40, costPerUnitCents: 35 },
    { name: 'Chicken breast', unit: 'kg', quantityOnHand: 18, reorderLevel: 5, costPerUnitCents: 900 },
    { name: 'Pasta', unit: 'kg', quantityOnHand: 25, reorderLevel: 6, costPerUnitCents: 250 },
    { name: 'Tomatoes', unit: 'kg', quantityOnHand: 12, reorderLevel: 4, costPerUnitCents: 300 },
    { name: 'Mozzarella', unit: 'kg', quantityOnHand: 4, reorderLevel: 5, costPerUnitCents: 1100 },
    { name: 'Potatoes', unit: 'kg', quantityOnHand: 40, reorderLevel: 10, costPerUnitCents: 120 },
    { name: 'Coffee beans', unit: 'kg', quantityOnHand: 6, reorderLevel: 2, costPerUnitCents: 2200 },
    { name: 'Milk', unit: 'l', quantityOnHand: 30, reorderLevel: 8, costPerUnitCents: 110 },
    { name: 'Salmon fillet', unit: 'kg', quantityOnHand: 7, reorderLevel: 3, costPerUnitCents: 2400 },
  ].map((i) => ({ ...i, outletId: outlet!.id }))).returning();
  const invId = (name: string) => inv.find((i) => i.name === name)!.id;

  // Menu
  const cats = await tx.insert(menuCategories).values([
    { outletId: outlet!.id, name: 'Starters', sortOrder: 0 },
    { outletId: outlet!.id, name: 'Mains', sortOrder: 1 },
    { outletId: outlet!.id, name: 'Desserts', sortOrder: 2 },
    { outletId: outlet!.id, name: 'Drinks', sortOrder: 3 },
  ]).returning();
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const items = await tx.insert(menuItems).values([
    { categoryId: cat('Starters'), name: 'Tomato Bruschetta', priceCents: 750, isVeg: true, prepTimeMin: 8 },
    { categoryId: cat('Starters'), name: 'Crispy Calamari', priceCents: 1150, prepTimeMin: 10 },
    { categoryId: cat('Starters'), name: 'French Fries', priceCents: 550, isVeg: true, prepTimeMin: 6,
      modifiers: [{ name: 'Truffle oil', priceCents: 200 }, { name: 'Cheese sauce', priceCents: 150 }] },
    { categoryId: cat('Mains'), name: 'Classic Burger', priceCents: 1495, station: 'GRILL' as const, prepTimeMin: 15,
      modifiers: [{ name: 'Extra cheese', priceCents: 150 }, { name: 'Bacon', priceCents: 250 }, { name: 'No onions', priceCents: 0 }] },
    { categoryId: cat('Mains'), name: 'Grilled Salmon', priceCents: 2450, station: 'GRILL' as const, prepTimeMin: 18 },
    { categoryId: cat('Mains'), name: 'Chicken Alfredo', priceCents: 1795, prepTimeMin: 15 },
    { categoryId: cat('Mains'), name: 'Margherita Pizza', priceCents: 1395, isVeg: true, prepTimeMin: 14,
      modifiers: [{ name: 'Extra mozzarella', priceCents: 200 }, { name: 'Gluten-free base', priceCents: 300 }] },
    { categoryId: cat('Mains'), name: 'Penne Arrabbiata', priceCents: 1495, isVeg: true, prepTimeMin: 12 },
    { categoryId: cat('Desserts'), name: 'Tiramisu', priceCents: 850, isVeg: true, station: 'DESSERT' as const, prepTimeMin: 4 },
    { categoryId: cat('Desserts'), name: 'Chocolate Lava Cake', priceCents: 950, isVeg: true, station: 'DESSERT' as const, prepTimeMin: 12 },
    { categoryId: cat('Drinks'), name: 'Cappuccino', priceCents: 450, isVeg: true, station: 'BAR' as const, prepTimeMin: 3,
      modifiers: [{ name: 'Oat milk', priceCents: 60 }, { name: 'Extra shot', priceCents: 80 }] },
    { categoryId: cat('Drinks'), name: 'Fresh Lemonade', priceCents: 495, isVeg: true, station: 'BAR' as const, prepTimeMin: 3 },
    { categoryId: cat('Drinks'), name: 'House Red Wine (glass)', priceCents: 1100, isVeg: true, station: 'BAR' as const, prepTimeMin: 1, taxRateBps: 1200 },
    { categoryId: cat('Drinks'), name: 'Craft Beer', priceCents: 850, isVeg: true, station: 'BAR' as const, prepTimeMin: 1, taxRateBps: 1200 },
  ].map((m) => ({ ...m, outletId: outlet!.id }))).returning();
  const item = (n: string) => items.find((i) => i.name === n)!;

  await tx.insert(recipeLines).values([
    { menuItemId: item('Classic Burger').id, inventoryItemId: invId('Beef patty'), quantity: 1 },
    { menuItemId: item('Classic Burger').id, inventoryItemId: invId('Burger bun'), quantity: 1 },
    { menuItemId: item('Chicken Alfredo').id, inventoryItemId: invId('Chicken breast'), quantity: 0.18 },
    { menuItemId: item('Chicken Alfredo').id, inventoryItemId: invId('Pasta'), quantity: 0.12 },
    { menuItemId: item('Penne Arrabbiata').id, inventoryItemId: invId('Pasta'), quantity: 0.12 },
    { menuItemId: item('Penne Arrabbiata').id, inventoryItemId: invId('Tomatoes'), quantity: 0.15 },
    { menuItemId: item('Margherita Pizza').id, inventoryItemId: invId('Mozzarella'), quantity: 0.12 },
    { menuItemId: item('Margherita Pizza').id, inventoryItemId: invId('Tomatoes'), quantity: 0.1 },
    { menuItemId: item('Tomato Bruschetta').id, inventoryItemId: invId('Tomatoes'), quantity: 0.08 },
    { menuItemId: item('French Fries').id, inventoryItemId: invId('Potatoes'), quantity: 0.25 },
    { menuItemId: item('Grilled Salmon').id, inventoryItemId: invId('Salmon fillet'), quantity: 0.2 },
    { menuItemId: item('Cappuccino').id, inventoryItemId: invId('Coffee beans'), quantity: 0.018 },
    { menuItemId: item('Cappuccino').id, inventoryItemId: invId('Milk'), quantity: 0.15 },
  ]);

  // Historical completed orders for reports.
  let seq = 0;
  const methods = ['CASH', 'CARD', 'CARD', 'CARD', 'UPI', 'WALLET'] as const;
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const count = 18 + Math.floor(rand() * 15);
    for (let n = 0; n < count; n++) {
      const opened = new Date(Date.now() - d * 86_400_000);
      opened.setUTCHours(15 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0);
      const closed = new Date(opened.getTime() + (35 + rand() * 60) * 60_000);
      const type = rand() < 0.75 ? 'DINE_IN' as const : rand() < 0.6 ? 'TAKEAWAY' as const : 'DELIVERY' as const;
      const lines = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => {
        const m = pick(items);
        return {
          menuItemId: m.id, name: m.name, station: m.station, unitPriceCents: m.priceCents,
          taxRateBps: m.taxRateBps ?? outlet!.taxRateBps, quantity: 1 + Math.floor(rand() * 2),
          modifiers: [], modifiersCents: 0,
        };
      });
      const svc = type === 'DINE_IN' ? outlet!.serviceChargeBps : 0;
      const discount = rand() < 0.08 ? { type: 'PERCENT' as const, bps: 1000 } : null;
      const totals = computeBill({ lines, serviceChargeBps: svc, discount });
      const tip = type === 'DINE_IN' && rand() < 0.5 ? Math.round(totals.totalCents * 0.1) : 0;
      const waiter = pick(waiters);
      const [o] = await tx.insert(orders).values({
        outletId: outlet!.id, orderNumber: ++seq, type, status: 'COMPLETED',
        tableId: type === 'DINE_IN' ? pick(tables).id : null,
        guestCount: type === 'DINE_IN' ? 1 + Math.floor(rand() * 5) : 1,
        waiterId: waiter.id, serviceChargeBps: svc, discount, discountReason: discount ? 'Loyalty' : null,
        ...totals, paidCents: totals.totalCents, tipCents: tip,
        openedAt: opened, closedAt: closed, createdAt: opened,
      }).returning();
      await tx.insert(orderItems).values(lines.map((l) => ({
        ...l, orderId: o!.id, outletId: outlet!.id, status: 'SERVED' as const, createdById: waiter.id,
        firedAt: opened, readyAt: closed, servedAt: closed, createdAt: opened,
      })));
      await tx.insert(payments).values({
        orderId: o!.id, outletId: outlet!.id, method: pick([...methods]), amountCents: totals.totalCents,
        tipCents: tip, createdById: userRows[2]!.id, createdAt: closed,
      });
    }
  }
  await tx.update(outlets).set({ orderSeq: seq }).where(eq(outlets.id, outlet!.id));

  // Upcoming reservations
  const soon = (h: number) => new Date(Date.now() + h * 3_600_000);
  await tx.insert(reservations).values([
    { outletId: outlet!.id, tableId: tables.find((t) => t.label === 'P1')!.id, customerName: 'Priya Sharma', customerPhone: '+1 555 0142', partySize: 5, reservedFor: soon(2), notes: 'Birthday — bring a candle' },
    { outletId: outlet!.id, tableId: tables.find((t) => t.label === 'T5')!.id, customerName: 'James Miller', customerPhone: '+1 555 0177', partySize: 4, reservedFor: soon(3) },
    { outletId: outlet!.id, customerName: 'Aiko Tanaka', customerPhone: '+1 555 0199', partySize: 2, reservedFor: soon(26) },
  ]);
});

console.log(`Seeded demo organization. Sign in with owner@demo.tablewise.app / ${PASSWORD}`);
await pool.end();
