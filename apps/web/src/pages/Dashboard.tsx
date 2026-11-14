import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, CalendarDays, ChefHat, ClipboardList, DollarSign, LayoutGrid, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { money, time, titleCase } from '../lib/format';
import type { Reservation } from '../lib/types';
import { Card, EmptyState, PageHeader, PageLoader, Stat } from '../components/ui';
import { Page } from '../components/Layout';
import { tableTone } from '../components/status';
import type { TableStatus } from '@tablewise/shared';

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
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', outlet.id],
    queryFn: () => api.get<DashboardData>(`${base}/dashboard`),
    refetchInterval: 60_000,
  });
  if (isLoading || !data) return <Page><PageLoader /></Page>;
  const occupied = data.tables.byStatus.OCCUPIED ?? 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Page>
      <PageHeader title={`${greeting}, ${session?.user.name.split(' ')[0]}`} description={`Here's what's happening at ${outlet.name} today.`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sales today" value={money(data.today.salesCents, outlet.currency)} sub={`${data.today.orders} orders · avg ${money(data.today.avgOrderCents, outlet.currency)}`} icon={<DollarSign className="h-5 w-5" />} />
        <Stat label="Open orders" value={data.openOrders.count} sub={`${money(data.openOrders.valueCents, outlet.currency)} in progress`} icon={<ClipboardList className="h-5 w-5" />} tone="sky" />
        <Stat label="Tables occupied" value={`${occupied}/${data.tables.total}`} sub={data.tables.total ? `${Math.round((occupied / data.tables.total) * 100)}% occupancy` : 'No tables set up'} icon={<LayoutGrid className="h-5 w-5" />} tone="violet" />
        <Stat label="Kitchen queue" value={data.kitchenQueue} sub="items waiting or cooking" icon={<ChefHat className="h-5 w-5" />} tone="amber" />
      </div>

      {data.lowStockCount > 0 && can('inventory:view') && (
        <Link to="/inventory" className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <span><strong>{data.lowStockCount}</strong> inventory item{data.lowStockCount > 1 ? 's are' : ' is'} at or below reorder level.</span>
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Floor status" className="lg:col-span-1" actions={<Link to="/floor" className="text-xs font-medium text-brand-700 hover:underline">Open floor</Link>}>
          <ul className="divide-y divide-slate-100">
            {(Object.keys(tableTone) as TableStatus[]).map((s) => (
              <li key={s} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full border ${tableTone[s].card}`} />
                  {titleCase(s)}
                </span>
                <span className="tabular font-medium">{data.tables.byStatus[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Upcoming reservations (next 4h)" className="lg:col-span-2" actions={<Link to="/reservations" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>}>
          {data.upcomingReservations.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="No upcoming reservations" />
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
