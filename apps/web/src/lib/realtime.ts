import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SOCKET_EVENTS } from '@tablewise/shared';
import { tokenStore } from './api';

/**
 * Connects to the realtime gateway for the current outlet and invalidates the
 * relevant React Query caches when the server broadcasts changes.
 */
export function useRealtime(outletId: string | undefined) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!outletId) return;
    const socket: Socket = io({
      path: '/socket.io',
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ['websocket', 'polling'],
    });
    const join = () => socket.emit('join', outletId);
    socket.on('connect', () => { setConnected(true); join(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    const inv = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    socket.on(SOCKET_EVENTS.ORDER_UPDATED, (p: { id: string }) => {
      inv('orders', 'floor', 'dashboard');
      qc.invalidateQueries({ queryKey: ['order', p.id] });
    });
    socket.on(SOCKET_EVENTS.KITCHEN_UPDATED, () => inv('kitchen', 'dashboard'));
    socket.on(SOCKET_EVENTS.TABLE_UPDATED, () => inv('floor', 'dashboard'));
    socket.on(SOCKET_EVENTS.RESERVATION_UPDATED, () => inv('reservations', 'dashboard'));
    socket.on(SOCKET_EVENTS.MENU_UPDATED, () => inv('menu'));
    socket.on(SOCKET_EVENTS.INVENTORY_LOW, (items: { name: string }[]) => {
      inv('inventory', 'dashboard');
      toast.warning(`Low stock: ${items.map((i) => i.name).join(', ')}`);
    });
    return () => { socket.disconnect(); };
  }, [outletId, qc]);

  return connected;
}
