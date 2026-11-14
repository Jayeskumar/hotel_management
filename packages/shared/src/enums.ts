export const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'CHEF'] as const;
export type Role = (typeof ROLES)[number];

export const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'OUT_OF_SERVICE'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const ORDER_TYPES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/** OPEN: being served. COMPLETED: fully paid & closed. CANCELLED: voided before payment. */
export const ORDER_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Kitchen lifecycle for a single line item.
 * PENDING  -> added to the order but not yet sent to the kitchen (editable)
 * QUEUED   -> fired to the kitchen, waiting to be picked up
 * PREPARING-> a cook has started it
 * READY    -> ready at the pass
 * SERVED   -> delivered to the guest
 * VOIDED   -> removed (requires a reason once fired)
 */
export const ITEM_STATUSES = ['PENDING', 'QUEUED', 'PREPARING', 'READY', 'SERVED', 'VOIDED'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const STATIONS = ['KITCHEN', 'BAR', 'DESSERT', 'GRILL'] as const;
export type Station = (typeof STATIONS)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['COMPLETED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const RESERVATION_STATUSES = ['BOOKED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STOCK_REASONS = ['PURCHASE', 'USAGE', 'WASTE', 'ADJUSTMENT'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export const UNITS = ['kg', 'g', 'l', 'ml', 'pcs'] as const;
export type Unit = (typeof UNITS)[number];

/** Allowed kitchen transitions. Voids are handled separately (permission-gated). */
export const ITEM_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  PENDING: ['QUEUED'],
  QUEUED: ['PREPARING', 'READY'],
  PREPARING: ['READY', 'QUEUED'],
  READY: ['SERVED', 'PREPARING'],
  SERVED: [],
  VOIDED: [],
};

export const RESERVATION_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  BOOKED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
