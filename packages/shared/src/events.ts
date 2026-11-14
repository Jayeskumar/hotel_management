/** Realtime events broadcast to the `outlet:<id>` socket room. */
export const SOCKET_EVENTS = {
  ORDER_UPDATED: 'order.updated',
  TABLE_UPDATED: 'table.updated',
  KITCHEN_UPDATED: 'kitchen.updated',
  RESERVATION_UPDATED: 'reservation.updated',
  INVENTORY_LOW: 'inventory.low',
  MENU_UPDATED: 'menu.updated',
} as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
