import type { ItemStatus, OrderStatus, ReservationStatus, TableStatus } from '@tablewise/shared';
import { Badge, type Tone } from './ui';
import { titleCase } from '../lib/format';

export const tableTone: Record<TableStatus, { tone: Tone; card: string }> = {
  AVAILABLE: { tone: 'green', card: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100' },
  OCCUPIED: { tone: 'red', card: 'border-rose-300 bg-rose-50 hover:bg-rose-100' },
  RESERVED: { tone: 'blue', card: 'border-sky-300 bg-sky-50 hover:bg-sky-100' },
  CLEANING: { tone: 'yellow', card: 'border-amber-300 bg-amber-50 hover:bg-amber-100' },
  OUT_OF_SERVICE: { tone: 'gray', card: 'border-slate-300 bg-slate-100 hover:bg-slate-200 opacity-70' },
};

const itemTone: Record<ItemStatus, Tone> = {
  PENDING: 'gray', QUEUED: 'blue', PREPARING: 'yellow', READY: 'green', SERVED: 'brand', VOIDED: 'red',
};
const orderTone: Record<OrderStatus, Tone> = { OPEN: 'blue', COMPLETED: 'green', CANCELLED: 'red' };
const resTone: Record<ReservationStatus, Tone> = { BOOKED: 'blue', SEATED: 'purple', COMPLETED: 'green', CANCELLED: 'gray', NO_SHOW: 'red' };

export const TableStatusBadge = ({ status }: { status: TableStatus }) => <Badge tone={tableTone[status].tone}>{titleCase(status)}</Badge>;
export const ItemStatusBadge = ({ status }: { status: ItemStatus }) =>
  <Badge tone={itemTone[status]}>{status === 'PENDING' ? 'Not sent' : titleCase(status)}</Badge>;
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={orderTone[status]}>{titleCase(status)}</Badge>;
export const ReservationStatusBadge = ({ status }: { status: ReservationStatus }) => <Badge tone={resTone[status]}>{titleCase(status)}</Badge>;
