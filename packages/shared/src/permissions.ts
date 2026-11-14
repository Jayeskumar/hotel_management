import type { Role } from './enums.js';

export const PERMISSIONS = [
  'outlet:manage',
  'staff:manage',
  'menu:manage',
  'tables:manage',
  'tables:update_status',
  'orders:view',
  'orders:create',
  'orders:update',
  'orders:void_item',
  'orders:cancel',
  'orders:discount',
  'kitchen:view',
  'kitchen:update',
  'payments:create',
  'payments:refund',
  'reservations:view',
  'reservations:manage',
  'inventory:view',
  'inventory:manage',
  'reports:view',
  'audit:view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  MANAGER: ALL.filter((p) => p !== 'outlet:manage'),
  CASHIER: [
    'orders:view', 'orders:create', 'orders:update', 'orders:discount',
    'payments:create', 'tables:update_status',
    'reservations:view', 'reservations:manage', 'kitchen:view',
  ],
  WAITER: [
    'orders:view', 'orders:create', 'orders:update',
    'tables:update_status', 'kitchen:view',
    'reservations:view', 'reservations:manage',
  ],
  CHEF: ['kitchen:view', 'kitchen:update', 'orders:view', 'inventory:view'],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles a given role is allowed to assign when managing staff. */
export function assignableRoles(role: Role): Role[] {
  if (role === 'OWNER') return ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'CHEF'];
  if (role === 'MANAGER') return ['CASHIER', 'WAITER', 'CHEF'];
  return [];
}
