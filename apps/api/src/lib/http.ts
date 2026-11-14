import type { FastifyRequest } from 'fastify';

export function outletIdOf(req: FastifyRequest): string {
  return (req.params as { outletId: string }).outletId;
}

export function paged<T>(rows: T[], total: number, page: number, pageSize: number) {
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
