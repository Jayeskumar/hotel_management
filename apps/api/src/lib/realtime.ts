import type { Server } from 'socket.io';
import type { SocketEvent } from '@tablewise/shared';

/**
 * Thin wrapper so domain code can emit events without knowing about socket.io,
 * and tests can run without a socket server.
 */
export class Realtime {
  private io: Server | null = null;

  attach(io: Server) {
    this.io = io;
  }

  emit(outletId: string, event: SocketEvent, payload: unknown) {
    this.io?.to(`outlet:${outletId}`).emit(event, payload);
  }
}
