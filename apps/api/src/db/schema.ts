import { sql } from 'drizzle-orm';
import {
  boolean, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text,
  timestamp, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import {
  ITEM_STATUSES, ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES,
  RESERVATION_STATUSES, ROLES, STATIONS, STOCK_REASONS, TABLE_STATUSES,
} from '@tablewise/shared';

export const roleEnum = pgEnum('role', ROLES);
export const tableStatusEnum = pgEnum('table_status', TABLE_STATUSES);
export const orderTypeEnum = pgEnum('order_type', ORDER_TYPES);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const itemStatusEnum = pgEnum('item_status', ITEM_STATUSES);
export const stationEnum = pgEnum('station', STATIONS);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const reservationStatusEnum = pgEnum('reservation_status', RESERVATION_STATUSES);
export const stockReasonEnum = pgEnum('stock_reason', STOCK_REASONS);

const pk = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

// ---------------------------------------------------------------- Tenancy
export const organizations = pgTable('organizations', {
  id: pk(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  plan: varchar('plan', { length: 30 }).notNull().default('standard'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const outlets = pgTable('outlets', {
  id: pk(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  address: varchar('address', { length: 300 }),
  phone: varchar('phone', { length: 40 }),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  serviceChargeBps: integer('service_charge_bps').notNull().default(0),
  receiptFooter: varchar('receipt_footer', { length: 500 }),
  orderSeq: integer('order_seq').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('outlets_org_idx').on(t.organizationId)]);

export const users = pgTable('users', {
  id: pk(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 254 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
  index('users_org_idx').on(t.organizationId),
]);

export const userOutlets = pgTable('user_outlets', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.outletId] })]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: pk(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  familyId: uuid('family_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedById: uuid('replaced_by_id'),
  userAgent: varchar('user_agent', { length: 300 }),
  ip: varchar('ip', { length: 64 }),
  createdAt: createdAt(),
}, (t) => [index('refresh_tokens_user_idx').on(t.userId), index('refresh_tokens_family_idx').on(t.familyId)]);

// ---------------------------------------------------------------- Floor
export const areas = pgTable('areas', {
  id: pk(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index('areas_outlet_idx').on(t.outletId)]);

export const diningTables = pgTable('dining_tables', {
  id: pk(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'restrict' }),
  label: varchar('label', { length: 20 }).notNull(),
  seats: integer('seats').notNull().default(4),
  shape: varchar('shape', { length: 10 }).notNull().default('SQUARE'),
  posX: integer('pos_x').notNull().default(0),
  posY: integer('pos_y').notNull().default(0),
  status: tableStatusEnum('status').notNull().default('AVAILABLE'),
  isActive: boolean('is_active').notNull().default(true),
  statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('tables_outlet_idx').on(t.outletId),
  uniqueIndex('tables_outlet_label_uq').on(t.outletId, t.label),
]);

// ---------------------------------------------------------------- Menu
export const menuCategories = pgTable('menu_categories', {
  id: pk(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('menu_categories_outlet_idx').on(t.outletId)]);

export type Modifier = { name: string; priceCents: number };

export const menuItems = pgTable('menu_items', {
  id: pk(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => menuCategories.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 500 }),
  sku: varchar('sku', { length: 40 }),
  priceCents: integer('price_cents').notNull(),
  taxRateBps: integer('tax_rate_bps'),
  station: stationEnum('station').notNull().default('KITCHEN'),
  isAvailable: boolean('is_available').notNull().default(true),
  isVeg: boolean('is_veg').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  prepTimeMin: integer('prep_time_min').notNull().default(10),
  modifiers: jsonb('modifiers').$type<Modifier[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('menu_items_outlet_idx').on(t.outletId), index('menu_items_category_idx').on(t.categoryId)]);

// ---------------------------------------------------------------- Orders
export type Discount = { type: 'FLAT'; amountCents: number } | { type: 'PERCENT'; bps: number };

export const orders = pgTable('orders', {
  id: pk(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  orderNumber: integer('order_number').notNull(),
  type: orderTypeEnum('type').notNull(),
  status: orderStatusEnum('status').notNull().default('OPEN'),
  tableId: uuid('table_id').references(() => diningTables.id, { onDelete: 'set null' }),
  guestCount: integer('guest_count').notNull().default(1),
  customerName: varchar('customer_name', { length: 120 }),
  customerPhone: varchar('customer_phone', { length: 40 }),
  notes: varchar('notes', { length: 500 }),
  waiterId: uuid('waiter_id').references(() => users.id, { onDelete: 'set null' }),
  discount: jsonb('discount').$type<Discount | null>(),
  discountReason: varchar('discount_reason', { length: 200 }),
  serviceChargeBps: integer('service_charge_bps').notNull().default(0),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  serviceChargeCents: integer('service_charge_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  paidCents: integer('paid_cents').notNull().default(0),
  tipCents: integer('tip_cents').notNull().default(0),
  cancelReason: varchar('cancel_reason', { length: 200 }),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('orders_outlet_number_uq').on(t.outletId, t.orderNumber),
  index('orders_outlet_status_idx').on(t.outletId, t.status),
  index('orders_outlet_opened_idx').on(t.outletId, t.openedAt),
  index('orders_table_idx').on(t.tableId),
]);

export const orderItems = pgTable('order_items', {
  id: pk(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 120 }).notNull(),
  station: stationEnum('station').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  modifiers: jsonb('modifiers').$type<Modifier[]>().notNull().default([]),
  modifiersCents: integer('modifiers_cents').notNull().default(0),
  taxRateBps: integer('tax_rate_bps').notNull(),
  quantity: integer('quantity').notNull(),
  notes: varchar('notes', { length: 200 }),
  status: itemStatusEnum('status').notNull().default('PENDING'),
  voidReason: varchar('void_reason', { length: 200 }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  firedAt: timestamp('fired_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  servedAt: timestamp('served_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('order_items_order_idx').on(t.orderId),
  index('order_items_kitchen_idx').on(t.outletId, t.status),
]);

export const payments = pgTable('payments', {
  id: pk(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  method: paymentMethodEnum('method').notNull(),
  amountCents: integer('amount_cents').notNull(),
  tipCents: integer('tip_cents').notNull().default(0),
  reference: varchar('reference', { length: 120 }),
  status: paymentStatusEnum('status').notNull().default('COMPLETED'),
  idempotencyKey: varchar('idempotency_key', { length: 100 }),
  refundReason: varchar('refund_reason', { length: 200 }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  index('payments_order_idx').on(t.orderId),
  index('payments_outlet_created_idx').on(t.outletId, t.createdAt),
  uniqueIndex('payments_idempotency_uq').on(t.outletId, t.idempotencyKey),
]);

// ---------------------------------------------------------------- Reservations
export const reservations = pgTable('reservations', {
  id: pk(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').references(() => diningTables.id, { onDelete: 'set null' }),
  customerName: varchar('customer_name', { length: 120 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 40 }).notNull(),
  customerEmail: varchar('customer_email', { length: 254 }),
  partySize: integer('party_size').notNull(),
  reservedFor: timestamp('reserved_for', { withTimezone: true }).notNull(),
  durationMin: integer('duration_min').notNull().default(90),
  status: reservationStatusEnum('status').notNull().default('BOOKED'),
  notes: varchar('notes', { length: 500 }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('reservations_outlet_time_idx').on(t.outletId, t.reservedFor)]);

// ---------------------------------------------------------------- Inventory
export const inventoryItems = pgTable('inventory_items', {
  id: pk(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  unit: varchar('unit', { length: 10 }).notNull(),
  quantityOnHand: numeric('quantity_on_hand', { precision: 14, scale: 3, mode: 'number' }).notNull().default(0),
  reorderLevel: numeric('reorder_level', { precision: 14, scale: 3, mode: 'number' }).notNull().default(0),
  costPerUnitCents: integer('cost_per_unit_cents').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('inventory_outlet_idx').on(t.outletId), uniqueIndex('inventory_outlet_name_uq').on(t.outletId, t.name)]);

export const recipeLines = pgTable('recipe_lines', {
  menuItemId: uuid('menu_item_id').notNull().references(() => menuItems.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  quantity: numeric('quantity', { precision: 14, scale: 3, mode: 'number' }).notNull(),
}, (t) => [primaryKey({ columns: [t.menuItemId, t.inventoryItemId] })]);

export const stockMovements = pgTable('stock_movements', {
  id: pk(),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  delta: numeric('delta', { precision: 14, scale: 3, mode: 'number' }).notNull(),
  reason: stockReasonEnum('reason').notNull(),
  note: varchar('note', { length: 200 }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('stock_movements_item_idx').on(t.inventoryItemId, t.createdAt)]);

// ---------------------------------------------------------------- Audit
export const auditLogs = pgTable('audit_logs', {
  id: pk(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  entityType: varchar('entity_type', { length: 40 }).notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  ip: varchar('ip', { length: 64 }),
  createdAt: createdAt(),
}, (t) => [
  index('audit_org_created_idx').on(t.organizationId, t.createdAt),
  index('audit_entity_idx').on(t.entityType, t.entityId),
]);
