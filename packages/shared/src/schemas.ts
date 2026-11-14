import { z } from 'zod';
import {
  ORDER_TYPES, PAYMENT_METHODS, RESERVATION_STATUSES, ROLES, STATIONS,
  STOCK_REASONS, TABLE_STATUSES, UNITS, ITEM_STATUSES,
} from './enums.js';

const id = z.string().uuid();
const cents = z.number().int().min(0).max(100_000_000);
const bps = z.number().int().min(0).max(10_000);
const name = z.string().trim().min(1).max(120);

// ---------- Auth ----------
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerOrgSchema = z.object({
  organizationName: name,
  outletName: name,
  ownerName: name,
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  currency: z.string().length(3).toUpperCase().default('USD'),
  timezone: z.string().min(1).max(64).default('UTC'),
});
export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

// ---------- Outlets ----------
export const outletSchema = z.object({
  name,
  address: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  currency: z.string().length(3).toUpperCase(),
  timezone: z.string().min(1).max(64),
  taxRateBps: bps,
  serviceChargeBps: bps,
  receiptFooter: z.string().max(500).optional().nullable(),
});
export type OutletInput = z.infer<typeof outletSchema>;

// ---------- Staff ----------
export const createStaffSchema = z.object({
  name,
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  role: z.enum(ROLES),
  outletIds: z.array(id).min(1),
});
export const updateStaffSchema = z.object({
  name: name.optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  outletIds: z.array(id).min(1).optional(),
  password: passwordSchema.optional(),
});

// ---------- Floor ----------
export const areaSchema = z.object({ name, sortOrder: z.number().int().min(0).default(0) });
export const tableSchema = z.object({
  areaId: id,
  label: z.string().trim().min(1).max(20),
  seats: z.number().int().min(1).max(50),
  shape: z.enum(['SQUARE', 'ROUND', 'RECT']).default('SQUARE'),
  posX: z.number().int().min(0).max(100).default(0),
  posY: z.number().int().min(0).max(100).default(0),
});
export const tableStatusSchema = z.object({ status: z.enum(TABLE_STATUSES) });

// ---------- Menu ----------
export const categorySchema = z.object({
  name,
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const modifierSchema = z.object({ name: z.string().trim().min(1).max(60), priceCents: cents });
export const menuItemSchema = z.object({
  categoryId: id,
  name,
  description: z.string().trim().max(500).optional().nullable(),
  sku: z.string().trim().max(40).optional().nullable(),
  priceCents: cents,
  taxRateBps: bps.optional().nullable(),
  station: z.enum(STATIONS).default('KITCHEN'),
  isAvailable: z.boolean().default(true),
  isVeg: z.boolean().default(false),
  prepTimeMin: z.number().int().min(0).max(240).default(10),
  modifiers: z.array(modifierSchema).max(30).default([]),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;
export const recipeSchema = z.object({
  lines: z.array(z.object({ inventoryItemId: id, quantity: z.number().positive().max(100000) })).max(50),
});

// ---------- Orders ----------
export const orderLineSchema = z.object({
  menuItemId: id,
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  notes: z.string().trim().max(200).optional().nullable(),
});
export const createOrderSchema = z
  .object({
    type: z.enum(ORDER_TYPES),
    tableId: id.optional().nullable(),
    guestCount: z.number().int().min(1).max(100).default(1),
    customerName: z.string().trim().max(120).optional().nullable(),
    customerPhone: z.string().trim().max(40).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z.array(orderLineSchema).max(100).default([]),
  })
  .refine((o) => o.type !== 'DINE_IN' || !!o.tableId, { message: 'Dine-in orders need a table', path: ['tableId'] });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const addItemsSchema = z.object({ items: z.array(orderLineSchema).min(1).max(100) });
export const updateOrderSchema = z.object({
  guestCount: z.number().int().min(1).max(100).optional(),
  customerName: z.string().trim().max(120).optional().nullable(),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  tableId: id.optional().nullable(),
});
export const discountSchema = z.object({
  discount: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('FLAT'), amountCents: cents }),
      z.object({ type: z.literal('PERCENT'), bps }),
    ])
    .nullable(),
  reason: z.string().trim().max(200).optional(),
});
export const voidItemSchema = z.object({ reason: z.string().trim().min(3).max(200) });
export const cancelOrderSchema = z.object({ reason: z.string().trim().min(3).max(200) });
export const itemStatusSchema = z.object({ status: z.enum(ITEM_STATUSES) });
export const updateItemQtySchema = z.object({ quantity: z.number().int().min(1).max(99) });

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountCents: cents.refine((v) => v > 0, 'Amount must be positive'),
  tipCents: cents.default(0),
  reference: z.string().trim().max(120).optional().nullable(),
  /** Idempotency key supplied by the client to make retries safe. */
  idempotencyKey: z.string().min(8).max(100).optional(),
});
export const refundSchema = z.object({ reason: z.string().trim().min(3).max(200) });

// ---------- Reservations ----------
export const reservationSchema = z.object({
  customerName: name,
  customerPhone: z.string().trim().min(3).max(40),
  customerEmail: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  partySize: z.number().int().min(1).max(100),
  reservedFor: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(600).default(90),
  tableId: id.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export const reservationStatusSchema = z.object({ status: z.enum(RESERVATION_STATUSES) });

// ---------- Inventory ----------
export const inventoryItemSchema = z.object({
  name,
  unit: z.enum(UNITS),
  reorderLevel: z.number().min(0).max(1_000_000),
  costPerUnitCents: cents,
});
export const stockMovementSchema = z.object({
  delta: z.number().refine((v) => v !== 0, 'Delta cannot be zero'),
  reason: z.enum(STOCK_REASONS),
  note: z.string().trim().max(200).optional().nullable(),
});

// ---------- Query helpers ----------
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const dateRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
