import type {
  ItemStatus, OrderStatus, OrderType, PaymentMethod, Permission, ReservationStatus, Role, Station, TableStatus,
} from '@tablewise/shared';

export interface OutletSummary {
  id: string; name: string; currency: string; timezone: string; taxRateBps: number; serviceChargeBps: number;
  legalName: string | null; address: string | null; phone: string | null; gstin: string | null;
  fssaiNumber: string | null; upiVpa: string | null; receiptFooter: string | null; roundOff: boolean;
}
export interface Session {
  user: { id: string; name: string; email: string; role: Role };
  organization: { id: string; name: string; slug: string } | null;
  outlets: OutletSummary[];
  permissions: Permission[];
}
export interface Outlet extends OutletSummary {
  invoicePrefix: string;
}
export interface Area { id: string; name: string; sortOrder: number }
export interface DiningTable {
  id: string; areaId: string; label: string; seats: number; shape: string; posX: number; posY: number;
  status: TableStatus; statusChangedAt: string;
  openOrder: { id: string; orderNumber: number; totalCents: number; guestCount: number; openedAt: string } | null;
}
export interface Modifier { name: string; nameTa?: string | null; priceCents: number }
export interface Category { id: string; name: string; nameTa: string | null; sortOrder: number; isActive: boolean }
export interface MenuItem {
  id: string; categoryId: string; name: string; nameTa: string | null; description: string | null; sku: string | null;
  priceCents: number; taxRateBps: number | null; station: Station; isAvailable: boolean; isVeg: boolean;
  prepTimeMin: number; modifiers: Modifier[];
}
export interface OrderItem {
  id: string; orderId: string; menuItemId: string | null; name: string; nameTa: string | null; station: Station;
  unitPriceCents: number; modifiers: Modifier[]; modifiersCents: number; taxRateBps: number;
  quantity: number; notes: string | null; status: ItemStatus; voidReason: string | null;
  firedAt: string | null; startedAt: string | null; readyAt: string | null; servedAt: string | null; createdAt: string;
}
export interface Payment {
  id: string; method: PaymentMethod; amountCents: number; tipCents: number; reference: string | null;
  status: 'COMPLETED' | 'REFUNDED'; refundReason: string | null; createdAt: string;
}
export interface Order {
  id: string; orderNumber: number; type: OrderType; status: OrderStatus; tableId: string | null;
  guestCount: number; customerName: string | null; customerPhone: string | null; notes: string | null;
  discount: { type: 'FLAT'; amountCents: number } | { type: 'PERCENT'; bps: number } | null;
  discountReason: string | null; serviceChargeBps: number; roundOffCents: number; invoiceNumber: string | null;
  subtotalCents: number; discountCents: number; serviceChargeCents: number; taxCents: number;
  totalCents: number; paidCents: number; tipCents: number; cancelReason: string | null;
  openedAt: string; closedAt: string | null;
  tableLabel?: string | null; waiterName?: string | null;
}
export interface OrderDetail extends Order {
  table: { id: string; label: string } | null;
  items: OrderItem[];
  payments: Payment[];
  balanceCents: number;
}
export interface Paged<T> { data: T[]; page: number; pageSize: number; total: number; totalPages: number }
export interface KitchenTicket {
  orderId: string; orderNumber: number; orderType: OrderType; tableLabel: string | null;
  customerName: string | null; notes: string | null; firedAt: string | null; items: OrderItem[];
}
export interface Reservation {
  id: string; tableId: string | null; tableLabel: string | null; customerName: string; customerPhone: string;
  customerEmail: string | null; partySize: number; reservedFor: string; durationMin: number;
  status: ReservationStatus; notes: string | null;
}
export interface InventoryItem {
  id: string; name: string; unit: string; quantityOnHand: number; reorderLevel: number;
  costPerUnitCents: number; isLow: boolean;
}
export interface StaffMember {
  id: string; name: string; email: string; role: Role; isActive: boolean; lastLoginAt: string | null; outletIds: string[];
}
export interface AuditEntry {
  id: string; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown> | null;
  userName: string | null; ip: string | null; createdAt: string;
}
