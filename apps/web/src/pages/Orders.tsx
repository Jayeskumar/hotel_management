import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Bike, ClipboardList, Search, ShoppingBag } from 'lucide-react';
import { ORDER_STATUSES, ORDER_TYPES } from '@tablewise/shared';
import { api } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { dateTime, money } from '../lib/format';
import { useI18n } from '../i18n';
import type { Order, Paged } from '../lib/types';
import { Button, Card, EmptyState, Input, PageHeader, PageLoader, Select, Table, Td, Th } from '../components/ui';
import { Page } from '../components/Layout';
import { OrderStatusBadge } from '../components/status';
import { QuickOrderModal } from './Floor';
import type { OrderType } from '@tablewise/shared';

export default function Orders() {
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState('OPEN');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [newOrder, setNewOrder] = useState<OrderType | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '25', ...(status && { status }), ...(type && { type }), ...(q && { q }) });
  const { data, isLoading } = useQuery({
    queryKey: ['orders', outlet.id, params.toString()],
    queryFn: () => api.get<Paged<Order>>(`${base}/orders?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Page>
      <PageHeader title={t('orders.title')} description={t('orders.subtitle')}
        actions={can('orders:create') && <>
          <Button variant="secondary" onClick={() => setNewOrder('TAKEAWAY')}><ShoppingBag className="h-4 w-4" />{t('floor.parcel')}</Button>
          <Button variant="secondary" onClick={() => setNewOrder('DELIVERY')}><Bike className="h-4 w-4" />{t('floor.delivery')}</Button>
        </>} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder={t('orders.searchPh')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('orders.col.status')}>
            <option value="">{t('orders.allStatuses')}</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{t(`orderStatus.${s}`)}</option>)}
          </Select>
          <Select className="w-40" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label={t('orders.col.type')}>
            <option value="">{t('orders.allTypes')}</option>
            {ORDER_TYPES.map((s) => <option key={s} value={s}>{t(`orderType.${s}`)}</option>)}
          </Select>
        </div>
        {isLoading ? <PageLoader /> : !data?.data.length ? (
          <EmptyState icon={<ClipboardList className="h-10 w-10" />} title={t('orders.none')} description={t('orders.noneDesc')} />
        ) : (
          <>
            <Table>
              <thead className="bg-slate-50"><tr>
                <Th>{t('orders.col.order')}</Th><Th>{t('orders.col.invoice')}</Th><Th>{t('orders.col.type')}</Th><Th>{t('orders.col.table')}</Th><Th>{t('orders.col.server')}</Th><Th>{t('orders.col.opened')}</Th><Th>{t('orders.col.status')}</Th><Th className="text-right">{t('orders.col.total')}</Th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((o) => (
                  <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <Td className="font-semibold text-slate-900">#{o.orderNumber}</Td>
                    <Td className="font-mono text-xs">{o.invoiceNumber ?? '—'}</Td>
                    <Td>{t(`orderType.${o.type}`)}</Td>
                    <Td>{o.tableLabel ? t('floor.table', { label: o.tableLabel }) : o.customerName ?? '—'}</Td>
                    <Td>{o.waiterName ?? '—'}</Td>
                    <Td>{dateTime(o.openedAt, outlet.timezone)}</Td>
                    <Td><OrderStatusBadge status={o.status} /></Td>
                    <Td className="tabular text-right font-medium">{money(o.totalCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
              <span>{t('orders.count', { n: data.total })}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
                <span>{t('common.pageOf', { page: data.page, total: data.totalPages })}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
              </div>
            </div>
          </>
        )}
      </Card>
      {newOrder && <QuickOrderModal type={newOrder} onClose={() => setNewOrder(null)} />}
    </Page>
  );
}
