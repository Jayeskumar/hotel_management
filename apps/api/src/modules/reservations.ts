import { and, asc, eq, gte, lt, ne, notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  RESERVATION_STATUSES, RESERVATION_TRANSITIONS, reservationSchema, reservationStatusSchema, SOCKET_EVENTS,
} from '@tablewise/shared';
import type { Tx } from '../db/client.js';
import { diningTables, reservations } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { outletIdOf } from '../lib/http.js';
import { audit } from '../lib/audit.js';

const listQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(RESERVATION_STATUSES).optional(),
});

export default async function reservationRoutes(app: FastifyInstance) {
  const view = { preHandler: [app.requirePermission('reservations:view')] };
  const manage = { preHandler: [app.requirePermission('reservations:manage')] };

  /** Reject double-booking a table for overlapping time windows. */
  async function assertTableFree(tx: Tx, outletId: string, tableId: string, start: Date, durationMin: number, partySize: number, excludeId?: string) {
    const [table] = await tx.select().from(diningTables)
      .where(and(eq(diningTables.id, tableId), eq(diningTables.outletId, outletId), eq(diningTables.isActive, true)))
      .for('update');
    if (!table) throw notFound('Table');
    if (table.seats < partySize) throw badRequest(`Table ${table.label} seats only ${table.seats}`);
    const end = new Date(start.getTime() + durationMin * 60_000);
    const clash = await tx.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.tableId, tableId),
      notInArray(reservations.status, ['CANCELLED', 'NO_SHOW', 'COMPLETED']),
      lt(reservations.reservedFor, end),
      sql`${reservations.reservedFor} + (${reservations.durationMin} * interval '1 minute') > ${start.toISOString()}::timestamptz`,
      ...(excludeId ? [ne(reservations.id, excludeId)] : []),
    )).limit(1);
    if (clash.length) throw conflict(`Table ${table.label} is already booked for that time`);
  }

  app.get('/reservations', view, async (req) => {
    const outletId = outletIdOf(req);
    const q = parse(listQuery, req.query);
    return app.db.select({ reservation: reservations, tableLabel: diningTables.label }).from(reservations)
      .leftJoin(diningTables, eq(diningTables.id, reservations.tableId))
      .where(and(
        eq(reservations.outletId, outletId),
        ...(q.from ? [gte(reservations.reservedFor, new Date(q.from))] : []),
        ...(q.to ? [lt(reservations.reservedFor, new Date(q.to))] : []),
        ...(q.status ? [eq(reservations.status, q.status)] : []),
      ))
      .orderBy(asc(reservations.reservedFor))
      .then((rows) => rows.map((r) => ({ ...r.reservation, tableLabel: r.tableLabel })));
  });

  app.post('/reservations', manage, async (req, reply) => {
    const outletId = outletIdOf(req);
    const input = parse(reservationSchema, req.body);
    const start = new Date(input.reservedFor);
    const r = await app.db.transaction(async (tx) => {
      if (input.tableId) await assertTableFree(tx, outletId, input.tableId, start, input.durationMin, input.partySize);
      const [row] = await tx.insert(reservations).values({
        ...input, reservedFor: start, outletId, createdById: req.user.sub,
        customerEmail: input.customerEmail || null,
      }).returning();
      await audit(tx, req, { action: 'reservation.created', entityType: 'reservation', entityId: row!.id, outletId });
      return row!;
    });
    app.realtime.emit(outletId, SOCKET_EVENTS.RESERVATION_UPDATED, { id: r.id });
    reply.code(201);
    return r;
  });

  app.put('/reservations/:id', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const input = parse(reservationSchema, req.body);
    const start = new Date(input.reservedFor);
    const r = await app.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.outletId, outletId)));
      if (!existing) throw notFound('Reservation');
      if (existing.status !== 'BOOKED') throw conflict('Only booked reservations can be edited');
      if (input.tableId) await assertTableFree(tx, outletId, input.tableId, start, input.durationMin, input.partySize, id);
      const [row] = await tx.update(reservations)
        .set({ ...input, reservedFor: start, customerEmail: input.customerEmail || null })
        .where(eq(reservations.id, id)).returning();
      return row!;
    });
    app.realtime.emit(outletId, SOCKET_EVENTS.RESERVATION_UPDATED, { id });
    return r;
  });

  app.patch('/reservations/:id/status', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const { status } = parse(reservationStatusSchema, req.body);
    const r = await app.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.outletId, outletId))).for('update');
      if (!existing) throw notFound('Reservation');
      if (!RESERVATION_TRANSITIONS[existing.status].includes(status)) {
        throw conflict(`Cannot change reservation from ${existing.status} to ${status}`);
      }
      const [row] = await tx.update(reservations).set({ status }).where(eq(reservations.id, id)).returning();
      await audit(tx, req, { action: `reservation.${status.toLowerCase()}`, entityType: 'reservation', entityId: id, outletId });
      return row!;
    });
    app.realtime.emit(outletId, SOCKET_EVENTS.RESERVATION_UPDATED, { id });
    return r;
  });
}
