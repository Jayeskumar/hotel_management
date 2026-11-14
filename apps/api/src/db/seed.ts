/**
 * Seeds a demo Tamil Nadu restaurant group with a bilingual (English/Tamil) menu.
 * Idempotent: does nothing if the demo organisation already exists.
 * Usage: npm run db:seed  (SEED_HISTORY_DAYS=0 skips historical orders)
 */
import { eq } from 'drizzle-orm';
import { computeBill, financialYear } from '@tablewise/shared';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import {
  areas, diningTables, inventoryItems, menuCategories, menuItems, orderItems, orders, organizations, outlets,
  payments, recipeLines, reservations, userOutlets, users, type Modifier,
} from './schema.js';
import { hashPassword } from '../lib/password.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
await runMigrations(url);
const { db, pool } = createDb(url, 2);

const DEMO_SLUG = 'thendral-foods-demo';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123';
const HISTORY_DAYS = Number(process.env.SEED_HISTORY_DAYS ?? 14);
const IST_OFFSET_MIN = 330;

const existing = await db.select().from(organizations).where(eq(organizations.slug, DEMO_SLUG));
if (existing.length) {
  console.log('Demo organisation already exists; skipping seed.');
  await pool.end();
  process.exit(0);
}

let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const rupees = (r: number) => Math.round(r * 100);

/** A Date for a given IST wall-clock time `daysAgo` days back. */
function istDate(daysAgo: number, hour: number, minute: number) {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const d = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - daysAgo, hour, minute);
  return new Date(d - IST_OFFSET_MIN * 60_000);
}

await db.transaction(async (tx) => {
  const [org] = await tx.insert(organizations).values({ name: 'Thendral Foods', slug: DEMO_SLUG, plan: 'enterprise' }).returning();
  const [outlet] = await tx.insert(outlets).values({
    organizationId: org!.id, name: 'Thendral — T. Nagar', legalName: 'Thendral Foods Private Limited',
    address: '24, Usman Road, T. Nagar, Chennai 600017', phone: '+91 44 4000 1234',
    currency: 'INR', timezone: 'Asia/Kolkata', taxRateBps: 500, serviceChargeBps: 0, roundOff: true,
    gstin: '33AABCT1234F1Z5', fssaiNumber: '12419001000123', upiVpa: 'thendral.demo@okaxis', invoicePrefix: 'TNG',
    receiptFooter: 'நன்றி! மீண்டும் வருக — Thank you, visit again!',
  }).returning();
  const [outlet2] = await tx.insert(outlets).values({
    organizationId: org!.id, name: 'Thendral — Madurai', legalName: 'Thendral Foods Private Limited',
    address: '8, West Masi Street, Madurai 625001', currency: 'INR', timezone: 'Asia/Kolkata', taxRateBps: 500,
    gstin: '33AABCT1234F1Z5', invoicePrefix: 'MDU',
  }).returning();

  const hash = await hashPassword(PASSWORD);
  const staff = [
    { name: 'Senthil Kumar', email: 'owner@demo.tablewise.app', role: 'OWNER' as const },
    { name: 'Lakshmi Narayanan', email: 'manager@demo.tablewise.app', role: 'MANAGER' as const },
    { name: 'Priya Ramesh', email: 'cashier@demo.tablewise.app', role: 'CASHIER' as const },
    { name: 'Murugan', email: 'waiter@demo.tablewise.app', role: 'WAITER' as const },
    { name: 'Karthik', email: 'waiter2@demo.tablewise.app', role: 'WAITER' as const },
    { name: 'Selvam', email: 'chef@demo.tablewise.app', role: 'CHEF' as const },
  ];
  const userRows = await tx.insert(users).values(staff.map((s) => ({ ...s, organizationId: org!.id, passwordHash: hash }))).returning();
  await tx.insert(userOutlets).values(userRows.map((u) => ({ userId: u.id, outletId: outlet!.id })));
  await tx.insert(userOutlets).values({ userId: userRows[0]!.id, outletId: outlet2!.id });
  const waiters = userRows.filter((u) => u.role === 'WAITER');

  // Floor
  const [ac, nonAc, family] = await tx.insert(areas).values([
    { outletId: outlet!.id, name: 'AC Hall', sortOrder: 0 },
    { outletId: outlet!.id, name: 'Non-AC Hall', sortOrder: 1 },
    { outletId: outlet!.id, name: 'Family Room', sortOrder: 2 },
  ]).returning();
  const tableDefs = [
    ...Array.from({ length: 8 }, (_, i) => ({ areaId: ac!.id, label: `A${i + 1}`, seats: i < 4 ? 2 : 4 })),
    ...Array.from({ length: 6 }, (_, i) => ({ areaId: nonAc!.id, label: `N${i + 1}`, seats: 4 })),
    ...Array.from({ length: 3 }, (_, i) => ({ areaId: family!.id, label: `F${i + 1}`, seats: 8, shape: 'RECT' })),
  ];
  const tables = await tx.insert(diningTables).values(tableDefs.map((t) => ({ ...t, outletId: outlet!.id }))).returning();

  // Inventory
  const inv = await tx.insert(inventoryItems).values([
    { name: 'Idli rice', unit: 'kg', quantityOnHand: 60, reorderLevel: 15, costPerUnitCents: rupees(48) },
    { name: 'Urad dal', unit: 'kg', quantityOnHand: 25, reorderLevel: 6, costPerUnitCents: rupees(130) },
    { name: 'Seeraga samba rice', unit: 'kg', quantityOnHand: 30, reorderLevel: 8, costPerUnitCents: rupees(140) },
    { name: 'Raw rice (ponni)', unit: 'kg', quantityOnHand: 80, reorderLevel: 20, costPerUnitCents: rupees(55) },
    { name: 'Chicken', unit: 'kg', quantityOnHand: 22, reorderLevel: 8, costPerUnitCents: rupees(240) },
    { name: 'Mutton', unit: 'kg', quantityOnHand: 9, reorderLevel: 5, costPerUnitCents: rupees(800) },
    { name: 'Ghee', unit: 'kg', quantityOnHand: 4, reorderLevel: 5, costPerUnitCents: rupees(650) },
    { name: 'Milk', unit: 'l', quantityOnHand: 40, reorderLevel: 15, costPerUnitCents: rupees(56) },
    { name: 'Coffee powder', unit: 'kg', quantityOnHand: 5, reorderLevel: 2, costPerUnitCents: rupees(600) },
    { name: 'Maida', unit: 'kg', quantityOnHand: 35, reorderLevel: 10, costPerUnitCents: rupees(45) },
    { name: 'Groundnut oil', unit: 'l', quantityOnHand: 30, reorderLevel: 10, costPerUnitCents: rupees(190) },
    { name: 'Onion', unit: 'kg', quantityOnHand: 40, reorderLevel: 15, costPerUnitCents: rupees(35) },
  ].map((i) => ({ ...i, outletId: outlet!.id }))).returning();
  const invId = (name: string) => inv.find((i) => i.name === name)!.id;

  // Menu (prices exclusive of 5% GST)
  const cats = await tx.insert(menuCategories).values([
    { outletId: outlet!.id, name: 'Tiffin', nameTa: 'டிஃபன்', sortOrder: 0 },
    { outletId: outlet!.id, name: 'Meals & Rice', nameTa: 'சாப்பாடு & சாதம்', sortOrder: 1 },
    { outletId: outlet!.id, name: 'Non-Veg Specials', nameTa: 'அசைவ சிறப்பு', sortOrder: 2 },
    { outletId: outlet!.id, name: 'Tandoor', nameTa: 'தந்தூரி', sortOrder: 3 },
    { outletId: outlet!.id, name: 'Beverages', nameTa: 'பானங்கள்', sortOrder: 4 },
    { outletId: outlet!.id, name: 'Sweets', nameTa: 'இனிப்புகள்', sortOrder: 5 },
  ]).returning();
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const ghee: Modifier = { name: 'Extra ghee', nameTa: 'கூடுதல் நெய்', priceCents: rupees(20) };
  const podi: Modifier = { name: 'Podi', nameTa: 'பொடி', priceCents: rupees(15) };
  const lessSugar: Modifier = { name: 'Less sugar', nameTa: 'சர்க்கரை குறைவாக', priceCents: 0 };
  const strong: Modifier = { name: 'Strong', nameTa: 'ஸ்ட்ராங்', priceCents: 0 };
  const egg: Modifier = { name: 'Extra egg', nameTa: 'கூடுதல் முட்டை', priceCents: rupees(20) };
  const spicy: Modifier = { name: 'Extra spicy', nameTa: 'கூடுதல் காரம்', priceCents: 0 };

  type Item = { categoryId: string; name: string; nameTa: string; priceCents: number; station?: 'KITCHEN' | 'TIFFIN' | 'TANDOOR' | 'BEVERAGE' | 'SWEETS'; isVeg?: boolean; prepTimeMin?: number; modifiers?: Modifier[]; description?: string };
  const menu: Item[] = [
    { categoryId: cat('Tiffin'), name: 'Idli (2 pcs)', nameTa: 'இட்லி (2)', priceCents: rupees(50), station: 'TIFFIN', isVeg: true, prepTimeMin: 5, modifiers: [podi] },
    { categoryId: cat('Tiffin'), name: 'Medu Vada', nameTa: 'மெது வடை', priceCents: rupees(40), station: 'TIFFIN', isVeg: true, prepTimeMin: 5 },
    { categoryId: cat('Tiffin'), name: 'Ghee Roast Dosa', nameTa: 'நெய் ரோஸ்ட்', priceCents: rupees(120), station: 'TIFFIN', isVeg: true, prepTimeMin: 8, modifiers: [ghee, podi] },
    { categoryId: cat('Tiffin'), name: 'Masala Dosa', nameTa: 'மசாலா தோசை', priceCents: rupees(100), station: 'TIFFIN', isVeg: true, prepTimeMin: 8, modifiers: [ghee] },
    { categoryId: cat('Tiffin'), name: 'Ven Pongal', nameTa: 'வெண் பொங்கல்', priceCents: rupees(80), station: 'TIFFIN', isVeg: true, prepTimeMin: 5, modifiers: [ghee] },
    { categoryId: cat('Tiffin'), name: 'Parotta with Salna (2)', nameTa: 'பரோட்டா சால்னா (2)', priceCents: rupees(70), station: 'TIFFIN', prepTimeMin: 8 },
    { categoryId: cat('Tiffin'), name: 'Chicken Kothu Parotta', nameTa: 'சிக்கன் கொத்து பரோட்டா', priceCents: rupees(160), station: 'TIFFIN', prepTimeMin: 12, modifiers: [egg, spicy] },
    { categoryId: cat('Meals & Rice'), name: 'South Indian Meals', nameTa: 'சாப்பாடு (மீல்ஸ்)', priceCents: rupees(180), isVeg: true, prepTimeMin: 5, description: 'Rice, sambar, rasam, kootu, poriyal, appalam, curd, payasam' },
    { categoryId: cat('Meals & Rice'), name: 'Curd Rice', nameTa: 'தயிர் சாதம்', priceCents: rupees(90), isVeg: true, prepTimeMin: 3 },
    { categoryId: cat('Meals & Rice'), name: 'Dindigul Mutton Biryani', nameTa: 'திண்டுக்கல் மட்டன் பிரியாணி', priceCents: rupees(320), prepTimeMin: 10, modifiers: [egg] },
    { categoryId: cat('Meals & Rice'), name: 'Chicken Biryani', nameTa: 'சிக்கன் பிரியாணி', priceCents: rupees(240), prepTimeMin: 10, modifiers: [egg] },
    { categoryId: cat('Non-Veg Specials'), name: 'Chettinad Chicken', nameTa: 'செட்டிநாடு சிக்கன்', priceCents: rupees(280), prepTimeMin: 15, modifiers: [spicy] },
    { categoryId: cat('Non-Veg Specials'), name: 'Chicken 65', nameTa: 'சிக்கன் 65', priceCents: rupees(220), prepTimeMin: 12 },
    { categoryId: cat('Non-Veg Specials'), name: 'Nethili Fry', nameTa: 'நெத்திலி வறுவல்', priceCents: rupees(200), prepTimeMin: 12 },
    { categoryId: cat('Tandoor'), name: 'Tandoori Chicken (Half)', nameTa: 'தந்தூரி சிக்கன் (அரை)', priceCents: rupees(300), station: 'TANDOOR', prepTimeMin: 20, modifiers: [spicy] },
    { categoryId: cat('Tandoor'), name: 'Butter Naan', nameTa: 'பட்டர் நான்', priceCents: rupees(50), station: 'TANDOOR', isVeg: true, prepTimeMin: 6 },
    { categoryId: cat('Beverages'), name: 'Filter Coffee', nameTa: 'ஃபில்டர் காபி', priceCents: rupees(35), station: 'BEVERAGE', isVeg: true, prepTimeMin: 2, modifiers: [strong, lessSugar] },
    { categoryId: cat('Beverages'), name: 'Masala Tea', nameTa: 'மசாலா டீ', priceCents: rupees(30), station: 'BEVERAGE', isVeg: true, prepTimeMin: 2, modifiers: [lessSugar] },
    { categoryId: cat('Beverages'), name: 'Rose Milk', nameTa: 'ரோஸ் மில்க்', priceCents: rupees(60), station: 'BEVERAGE', isVeg: true, prepTimeMin: 2 },
    { categoryId: cat('Beverages'), name: 'Jigarthanda', nameTa: 'ஜிகர்தண்டா', priceCents: rupees(90), station: 'BEVERAGE', isVeg: true, prepTimeMin: 3 },
    { categoryId: cat('Beverages'), name: 'Fresh Lime Soda', nameTa: 'லைம் சோடா', priceCents: rupees(60), station: 'BEVERAGE', isVeg: true, prepTimeMin: 2 },
    { categoryId: cat('Sweets'), name: 'Rava Kesari', nameTa: 'ரவா கேசரி', priceCents: rupees(50), station: 'SWEETS', isVeg: true, prepTimeMin: 2 },
    { categoryId: cat('Sweets'), name: 'Elaneer Payasam', nameTa: 'இளநீர் பாயசம்', priceCents: rupees(90), station: 'SWEETS', isVeg: true, prepTimeMin: 2 },
    { categoryId: cat('Sweets'), name: 'Gulab Jamun (2)', nameTa: 'குலாப் ஜாமூன் (2)', priceCents: rupees(60), station: 'SWEETS', isVeg: true, prepTimeMin: 2 },
  ];
  const items = await tx.insert(menuItems).values(menu.map((m) => ({ ...m, outletId: outlet!.id, modifiers: m.modifiers ?? [] }))).returning();
  const item = (n: string) => items.find((i) => i.name === n)!;

  await tx.insert(recipeLines).values([
    { menuItemId: item('Idli (2 pcs)').id, inventoryItemId: invId('Idli rice'), quantity: 0.06 },
    { menuItemId: item('Idli (2 pcs)').id, inventoryItemId: invId('Urad dal'), quantity: 0.02 },
    { menuItemId: item('Medu Vada').id, inventoryItemId: invId('Urad dal'), quantity: 0.04 },
    { menuItemId: item('Medu Vada').id, inventoryItemId: invId('Groundnut oil'), quantity: 0.02 },
    { menuItemId: item('Ghee Roast Dosa').id, inventoryItemId: invId('Idli rice'), quantity: 0.08 },
    { menuItemId: item('Ghee Roast Dosa').id, inventoryItemId: invId('Urad dal'), quantity: 0.025 },
    { menuItemId: item('Ghee Roast Dosa').id, inventoryItemId: invId('Ghee'), quantity: 0.02 },
    { menuItemId: item('Masala Dosa').id, inventoryItemId: invId('Idli rice'), quantity: 0.08 },
    { menuItemId: item('Masala Dosa').id, inventoryItemId: invId('Urad dal'), quantity: 0.025 },
    { menuItemId: item('Parotta with Salna (2)').id, inventoryItemId: invId('Maida'), quantity: 0.15 },
    { menuItemId: item('Chicken Kothu Parotta').id, inventoryItemId: invId('Maida'), quantity: 0.15 },
    { menuItemId: item('Chicken Kothu Parotta').id, inventoryItemId: invId('Chicken'), quantity: 0.1 },
    { menuItemId: item('South Indian Meals').id, inventoryItemId: invId('Raw rice (ponni)'), quantity: 0.2 },
    { menuItemId: item('Curd Rice').id, inventoryItemId: invId('Raw rice (ponni)'), quantity: 0.12 },
    { menuItemId: item('Dindigul Mutton Biryani').id, inventoryItemId: invId('Seeraga samba rice'), quantity: 0.15 },
    { menuItemId: item('Dindigul Mutton Biryani').id, inventoryItemId: invId('Mutton'), quantity: 0.2 },
    { menuItemId: item('Dindigul Mutton Biryani').id, inventoryItemId: invId('Ghee'), quantity: 0.02 },
    { menuItemId: item('Chicken Biryani').id, inventoryItemId: invId('Seeraga samba rice'), quantity: 0.15 },
    { menuItemId: item('Chicken Biryani').id, inventoryItemId: invId('Chicken'), quantity: 0.2 },
    { menuItemId: item('Chettinad Chicken').id, inventoryItemId: invId('Chicken'), quantity: 0.25 },
    { menuItemId: item('Chicken 65').id, inventoryItemId: invId('Chicken'), quantity: 0.2 },
    { menuItemId: item('Chicken 65').id, inventoryItemId: invId('Groundnut oil'), quantity: 0.05 },
    { menuItemId: item('Filter Coffee').id, inventoryItemId: invId('Coffee powder'), quantity: 0.01 },
    { menuItemId: item('Filter Coffee').id, inventoryItemId: invId('Milk'), quantity: 0.1 },
    { menuItemId: item('Masala Tea').id, inventoryItemId: invId('Milk'), quantity: 0.1 },
    { menuItemId: item('Rose Milk').id, inventoryItemId: invId('Milk'), quantity: 0.2 },
  ]);

  // Historical orders with realistic Tamil Nadu meal times (IST).
  const tiffin = items.filter((i) => ['TIFFIN', 'BEVERAGE'].includes(i.station));
  const mains = items.filter((i) => !['BEVERAGE'].includes(i.station));
  const methods = ['UPI', 'UPI', 'UPI', 'UPI', 'CASH', 'CASH', 'CARD', 'WALLET'] as const;
  const invoiceSeqByFy = new Map<string, number>();
  let seq = 0;
  let lastFy = '';
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const count = 30 + Math.floor(rand() * 20);
    for (let n = 0; n < count; n++) {
      const slot = rand();
      const hour = slot < 0.35 ? 7 + Math.floor(rand() * 4) : slot < 0.7 ? 12 + Math.floor(rand() * 3) : slot < 0.8 ? 16 + Math.floor(rand() * 2) : 19 + Math.floor(rand() * 3);
      const opened = istDate(d, hour, Math.floor(rand() * 60));
      const closed = new Date(opened.getTime() + (20 + rand() * 40) * 60_000);
      const type = rand() < 0.7 ? 'DINE_IN' as const : rand() < 0.65 ? 'TAKEAWAY' as const : 'DELIVERY' as const;
      const pool = hour < 11 || (hour >= 16 && hour < 18) ? tiffin : mains;
      const lines = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => {
        const m = pick(pool);
        return {
          menuItemId: m.id, name: m.name, nameTa: m.nameTa, station: m.station, unitPriceCents: m.priceCents,
          taxRateBps: m.taxRateBps ?? outlet!.taxRateBps, quantity: 1 + Math.floor(rand() * 2),
          modifiers: [] as Modifier[], modifiersCents: 0,
        };
      });
      const discount = rand() < 0.05 ? { type: 'PERCENT' as const, bps: 1000 } : null;
      const totals = computeBill({ lines, serviceChargeBps: 0, discount, roundOff: true });
      const fy = financialYear(closed);
      const invSeq = (invoiceSeqByFy.get(fy) ?? 0) + 1;
      invoiceSeqByFy.set(fy, invSeq);
      lastFy = fy;
      const waiter = pick(waiters);
      const [o] = await tx.insert(orders).values({
        outletId: outlet!.id, orderNumber: ++seq, type, status: 'COMPLETED',
        tableId: type === 'DINE_IN' ? pick(tables).id : null,
        guestCount: type === 'DINE_IN' ? 1 + Math.floor(rand() * 4) : 1,
        customerName: type === 'DELIVERY' ? pick(['Arun', 'Divya', 'Kavitha', 'Ravi', 'Meena']) : null,
        waiterId: waiter.id, serviceChargeBps: 0, roundOff: true, discount, discountReason: discount ? 'Regular customer' : null,
        ...totals, paidCents: totals.totalCents, tipCents: 0,
        invoiceNumber: `TNG/${fy}/${String(invSeq).padStart(6, '0')}`,
        openedAt: opened, closedAt: closed, createdAt: opened,
      }).returning();
      await tx.insert(orderItems).values(lines.map((l) => ({
        ...l, orderId: o!.id, outletId: outlet!.id, status: 'SERVED' as const, createdById: waiter.id,
        firedAt: opened, readyAt: closed, servedAt: closed, createdAt: opened,
      })));
      await tx.insert(payments).values({
        orderId: o!.id, outletId: outlet!.id, method: pick(methods), amountCents: totals.totalCents,
        createdById: userRows[2]!.id, createdAt: closed,
      });
    }
  }
  await tx.update(outlets).set({
    orderSeq: seq, invoiceFy: lastFy || null, invoiceSeq: lastFy ? invoiceSeqByFy.get(lastFy)! : 0,
  }).where(eq(outlets.id, outlet!.id));

  const soon = (h: number) => new Date(Date.now() + h * 3_600_000);
  await tx.insert(reservations).values([
    { outletId: outlet!.id, tableId: tables.find((t) => t.label === 'F1')!.id, customerName: 'Meenakshi Sundaram', customerPhone: '+91 98400 12345', partySize: 7, reservedFor: soon(2), notes: 'Birthday — பிறந்தநாள் கேக்' },
    { outletId: outlet!.id, tableId: tables.find((t) => t.label === 'A5')!.id, customerName: 'Arun Prakash', customerPhone: '+91 94440 67890', partySize: 4, reservedFor: soon(3) },
    { outletId: outlet!.id, customerName: 'Divya Ramesh', customerPhone: '+91 90030 11223', partySize: 2, reservedFor: soon(26) },
  ]);
});

console.log(`Seeded demo restaurant. Sign in with owner@demo.tablewise.app / ${PASSWORD}`);
await pool.end();
