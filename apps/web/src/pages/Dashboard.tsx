import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, CalendarDays, ChefHat, ClipboardList, IndianRupee, LayoutGrid, Users } from 'lucide-react';
import type { TableStatus } from '@tablewise/shared';
import { api } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { money, time } from '../lib/format';
import { useI18n } from '../i18n';
import type { Reservation } from '../lib/types';
import { Card, EmptyState, PageHeader, PageLoader, Stat } from '../components/ui';
import { Page } from '../components/Layout';
import { tableTone } from '../components/status';

interface DashboardData {
  today: { salesCents: number; orders: number; guests: number; avgOrderCents: number };
  openOrders: { count: number; valueCents: number };
  tables: { total: number; byStatus: Partial<Record<TableStatus, number>> };
  kitchenQueue: number;
  upcomingReservations: Reservation[];
  lowStockCount: number;
}

export default function Dashboard() {
  const { outlet, base } = useOutlet();
  const { session, can } = useAuth();
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', outlet.id],
    queryFn: () => api.get<DashboardData>(`${base}/dashboard`),
    refetchInterval: 60_000,
  });
  if (isLoading || !data) return <Page><PageLoader /></Page>;
  const occupied = data.tables.byStatus.OCCUPIED ?? 0;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: outlet.timezone }).format(new Date()));
  const name = session?.user.name.split(' ')[0] ?? '';
  const greeting = t(hour < 12 ? 'dash.morning' : hour < 17 ? 'dash.afternoon' : 'dash.evening', { name });

  return (
    <Page>
      <PageHeader title={greeting} description={t('dash.subtitle', { outlet: outlet.name })} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('dash.salesToday')} value={money(data.today.salesCents)} sub={t('dash.salesSub', { orders: data.today.orders, avg: money(data.today.avgOrderCents) })} icon={<IndianRupee className="h-5 w-5" />} />
        <Stat label={t('dash.openOrders')} value={data.openOrders.count} sub={t('dash.openOrdersSub', { value: money(data.openOrders.valueCents) })} icon={<ClipboardList className="h-5 w-5" />} tone="sky" />
        <Stat label={t('dash.tablesOccupied')} value={`${occupied}/${data.tables.total}`} sub={data.tables.total ? t('dash.occupancy', { pct: Math.round((occupied / data.tables.total) * 100) }) : t('dash.noTables')} icon={<LayoutGrid className="h-5 w-5" />} tone="violet" />
        <Stat label={t('dash.kitchenQueue')} value={data.kitchenQueue} sub={t('dash.kitchenQueueSub')} icon={<ChefHat className="h-5 w-5" />} tone="amber" />
      </div>

      {data.lowStockCount > 0 && can('inventory:view') && (
        <Link to="/inventory" className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <span>{t('dash.lowStock', { n: data.lowStockCount })}</span>
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title={t('dash.floorStatus')} className="lg:col-span-1" actions={<Link to="/floor" className="text-xs font-medium text-brand-700 hover:underline">{t('dash.openFloor')}</Link>}>
          <ul className="divide-y divide-slate-100">
            {(Object.keys(tableTone) as TableStatus[]).map((s) => (
              <li key={s} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full border ${tableTone[s].card}`} />
                  {t(`tableStatus.${s}`)}
                </span>
                <span className="tabular font-medium">{data.tables.byStatus[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t('dash.upcoming')} className="lg:col-span-2" actions={<Link to="/reservations" className="text-xs font-medium text-brand-700 hover:underline">{t('dash.viewAll')}</Link>}>
          {data.upcomingReservations.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-8 w-8" />} title={t('dash.noUpcoming')} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcomingReservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{r.customerName}</p>
                    <p className="truncate text-xs text-slate-500">{r.customerPhone}{r.notes ? ` · ${r.notes}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-slate-600">
                    <span className="flex items-center gap-1"><Users className="h-4 w-4" />{r.partySize}</span>
                    <span className="tabular font-medium text-slate-900">{time(r.reservedFor, outlet.timezone)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}
