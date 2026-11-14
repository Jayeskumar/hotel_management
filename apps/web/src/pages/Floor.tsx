import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { clsx } from 'clsx';
import { Bike, Clock, LayoutGrid, Plus, ShoppingBag, Users } from 'lucide-react';
import { toast } from 'sonner';
import { TABLE_STATUSES, type OrderType, type TableStatus } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { elapsed, money } from '../lib/format';
import { useI18n } from '../i18n';
import type { Area, DiningTable, OrderDetail } from '../lib/types';
import { Button, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Tabs } from '../components/ui';
import { Page } from '../components/Layout';
import { TableStatusBadge, tableTone } from '../components/status';

export default function Floor() {
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [areaId, setAreaId] = useState<string>('all');
  const [selected, setSelected] = useState<DiningTable | null>(null);
  const [newOrder, setNewOrder] = useState<OrderType | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['floor', outlet.id],
    queryFn: () => api.get<{ areas: Area[]; tables: DiningTable[] }>(`${base}/floor`),
  });

  if (isLoading || !data) return <Page><PageLoader /></Page>;
  const tables = areaId === 'all' ? data.tables : data.tables.filter((tb) => tb.areaId === areaId);
  const counts = data.tables.reduce<Record<string, number>>((acc, tb) => ({ ...acc, [tb.status]: (acc[tb.status] ?? 0) + 1 }), {});

  return (
    <Page wide>
      <PageHeader
        title={t('floor.title')}
        description={t('floor.summary', { available: counts.AVAILABLE ?? 0, occupied: counts.OCCUPIED ?? 0, reserved: counts.RESERVED ?? 0, cleaning: counts.CLEANING ?? 0 })}
        actions={can('orders:create') && <>
          <Button variant="secondary" onClick={() => setNewOrder('TAKEAWAY')}><ShoppingBag className="h-4 w-4" />{t('floor.parcel')}</Button>
          <Button variant="secondary" onClick={() => setNewOrder('DELIVERY')}><Bike className="h-4 w-4" />{t('floor.delivery')}</Button>
        </>}
      />
      {data.tables.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="h-10 w-10" />} title={t('floor.noTables')}
          description={t('floor.noTablesDesc')}
          action={can('tables:manage') && <Button onClick={() => nav('/settings?tab=floor')}>{t('floor.setupFloor')}</Button>} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={areaId} onChange={setAreaId}
              tabs={[{ value: 'all', label: t('floor.allAreas') }, ...data.areas.map((a) => ({ value: a.id, label: a.name }))]} />
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {TABLE_STATUSES.map((s) => (
                <span key={s} className="flex items-center gap-1.5"><span className={clsx('h-3 w-3 rounded border', tableTone[s].card)} />{t(`tableStatus.${s}`)}</span>
              ))}
            </div>
          </div>
          {(areaId === 'all' ? data.areas : data.areas.filter((a) => a.id === areaId)).map((area) => {
            const list = tables.filter((tb) => tb.areaId === area.id);
            if (!list.length) return null;
            return (
              <section key={area.id} className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{area.name}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                  {list.map((tb) => (
                    <button key={tb.id} onClick={() => tb.openOrder ? nav(`/orders/${tb.openOrder.id}`) : setSelected(tb)}
                      className={clsx('flex h-28 flex-col justify-between border-2 p-3 text-left transition',
                        tb.shape === 'ROUND' ? 'rounded-[2rem]' : 'rounded-xl', tableTone[tb.status].card)}>
                      <div className="flex items-start justify-between">
                        <span className="text-xl font-bold text-slate-900">{tb.label}</span>
                        <span className="flex items-center gap-0.5 text-xs text-slate-600"><Users className="h-3 w-3" />{tb.openOrder?.guestCount ?? tb.seats}</span>
                      </div>
                      {tb.openOrder ? (
                        <div className="text-xs">
                          <p className="font-semibold text-slate-900 tabular">{money(tb.openOrder.totalCents)}</p>
                          <p className="flex items-center gap-1 text-slate-600"><Clock className="h-3 w-3" />{elapsed(tb.openOrder.openedAt, now)} · #{tb.openOrder.orderNumber}</p>
                        </div>
                      ) : (
                        <p className="text-xs font-medium text-slate-600">{t(`tableStatus.${tb.status}`)}{tb.status !== 'AVAILABLE' && ` · ${elapsed(tb.statusChangedAt, now)}`}</p>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {selected && <TableModal table={selected} onClose={() => setSelected(null)} onDone={() => qc.invalidateQueries({ queryKey: ['floor'] })} />}
      {newOrder && <QuickOrderModal type={newOrder} onClose={() => setNewOrder(null)} />}
    </Page>
  );
}

function TableModal({ table, onClose, onDone }: { table: DiningTable; onClose: () => void; onDone: () => void }) {
  const { base } = useOutlet();
  const { can } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [guests, setGuests] = useState(Math.min(2, table.seats));

  const seat = useMutation({
    mutationFn: () => api.post<OrderDetail>(`${base}/orders`, { type: 'DINE_IN', tableId: table.id, guestCount: guests }),
    onSuccess: (o) => { onDone(); nav(`/orders/${o.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setStatus = useMutation({
    mutationFn: (status: TableStatus) => api.patch(`${base}/tables/${table.id}/status`, { status }),
    onSuccess: () => { onDone(); onClose(); toast.success(t('floor.tableUpdated', { label: table.label })); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal open onClose={onClose} title={t('floor.table', { label: table.label })} size="sm">
      <div className="mb-4 flex items-center justify-between">
        <TableStatusBadge status={table.status} />
        <span className="text-sm text-slate-500">{t('common.seats', { n: table.seats })}</span>
      </div>
      {can('orders:create') && table.status !== 'OUT_OF_SERVICE' && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); seat.mutate(); }}>
          <Field label={t('floor.guests')}>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setGuests(Math.max(1, guests - 1))}>−</Button>
              <Input type="number" min={1} max={100} value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)} className="text-center" />
              <Button type="button" variant="secondary" onClick={() => setGuests(guests + 1)}>+</Button>
            </div>
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={seat.isPending}><Plus className="h-4 w-4" />{t('floor.seatGuests')}</Button>
        </form>
      )}
      {can('tables:update_status') && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('floor.setStatus')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['AVAILABLE', 'RESERVED', 'CLEANING', 'OUT_OF_SERVICE'] as const).filter((s) => s !== table.status).map((s) => (
              <Button key={s} variant="secondary" size="sm" onClick={() => setStatus.mutate(s)} disabled={setStatus.isPending}>{t(`tableStatus.${s}`)}</Button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function QuickOrderModal({ type, onClose }: { type: OrderType; onClose: () => void }) {
  const { base } = useOutlet();
  const nav = useNavigate();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const create = useMutation({
    mutationFn: () => api.post<OrderDetail>(`${base}/orders`, { type, customerName: name || null, customerPhone: phone || null }),
    onSuccess: (o) => nav(`/orders/${o.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={t('floor.newOrder', { type: t(`orderType.${type}`) })} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button form="quick-order" type="submit" loading={create.isPending}>{t('floor.startOrder')}</Button></>}>
      <form id="quick-order" className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label={t('floor.customerName')}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required={type === 'DELIVERY'} /></Field>
        <Field label={t('common.phone')}><Input value={phone} onChange={(e) => setPhone(e.target.value)} required={type === 'DELIVERY'} /></Field>
      </form>
    </Modal>
  );
}
