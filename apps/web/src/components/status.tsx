import type { ItemStatus, OrderStatus, ReservationStatus, TableStatus } from '@tablewise/shared';
import { Badge, type Tone } from './ui';
import { useI18n } from '../i18n';

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

export function TableStatusBadge({ status }: { status: TableStatus }) {
  const { t } = useI18n();
  return <Badge tone={tableTone[status].tone}>{t(`tableStatus.${status}`)}</Badge>;
}
export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const { t } = useI18n();
  return <Badge tone={itemTone[status]}>{t(`itemStatus.${status}`)}</Badge>;
}
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  return <Badge tone={orderTone[status]}>{t(`orderStatus.${status}`)}</Badge>;
}
export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const { t } = useI18n();
  return <Badge tone={resTone[status]}>{t(`resStatus.${status}`)}</Badge>;
}
