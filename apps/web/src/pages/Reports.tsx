import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, download, errorMessage } from '../lib/api';
import { useOutlet } from '../lib/auth';
import { money, titleCase } from '../lib/format';
import { Button, Card, EmptyState, PageHeader, PageLoader, Stat, Table, Tabs, Td, Th } from '../components/ui';
import { Page } from '../components/Layout';

interface SalesReport {
  summary: {
    orders: number; grossCents: number; discountCents: number; serviceChargeCents: number; taxCents: number;
    totalCents: number; tipCents: number; guests: number; netSalesCents: number; avgOrderCents: number; avgTurnMin: number;
  };
  byDay: { day: string; totalCents: number; orders: number }[];
  byHour: { hour: number; totalCents: number; orders: number }[];
  byType: { type: string; totalCents: number; orders: number }[];
  byMethod: { method: string; amountCents: number; count: number }[];
  topItems: { name: string; quantity: number; revenueCents: number }[];
  byCategory: { category: string; revenueCents: number }[];
  byStaff: { name: string; orders: number; totalCents: number; tipCents: number }[];
  voids: { count: number; valueCents: number };
  cancelledOrders: number;
  refunds: { count: number; amountCents: number };
}

type Range = 'today' | '7d' | '30d' | '90d';
const BAR = '#0d9488';
const GRID = '#e2e8f0';
const AXIS = { fontSize: 11, fill: '#64748b' };

function rangeDates(r: Range) {
  const to = new Date();
  const from = new Date();
  if (r === 'today') from.setHours(0, 0, 0, 0);
  else from.setDate(from.getDate() - Number(r.replace('d', '')));
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function Reports() {
  const { outlet, base } = useOutlet();
  const cur = outlet.currency;
  const [range, setRange] = useState<Range>('7d');
  const { from, to } = useMemo(() => rangeDates(range), [range]);
  const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const { data, isLoading } = useQuery({
    queryKey: ['reports', outlet.id, range],
    queryFn: () => api.get<SalesReport>(`${base}/reports/sales?${qs}`),
  });
  const compact = (c: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, notation: 'compact' }).format(c / 100);
  const tip = (v: unknown) => money(Number(v), cur);

  return (
    <Page>
      <PageHeader title="Reports" description="Sales, payments, menu performance and staff performance."
        actions={<>
          <Tabs value={range} onChange={setRange} tabs={[{ value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }]} />
          <Button variant="secondary" onClick={() => download(`${base}/reports/orders.csv?${qs}`, `orders-${range}.csv`).catch((e) => toast.error(errorMessage(e)))}>
            <Download className="h-4 w-4" />Export CSV
          </Button>
        </>} />
      {isLoading || !data ? <PageLoader /> : data.summary.orders === 0 ? (
        <Card><EmptyState title="No completed sales in this period" description="Completed orders will appear here." /></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total sales" value={money(data.summary.totalCents, cur)} sub={`Net ${money(data.summary.netSalesCents, cur)} · tax ${money(data.summary.taxCents, cur)}`} />
            <Stat label="Orders" value={data.summary.orders} sub={`${data.summary.guests} guests`} tone="sky" />
            <Stat label="Average order" value={money(data.summary.avgOrderCents, cur)} sub={`Avg dine-in turn ${data.summary.avgTurnMin} min`} tone="violet" />
            <Stat label="Tips" value={money(data.summary.tipCents, cur)} sub={`Discounts ${money(data.summary.discountCents, cur)}`} tone="amber" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Sales by day">
              <div className="h-64 p-4">
                <ResponsiveContainer>
                  <BarChart data={data.byDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={56} />
                    <Tooltip formatter={tip} cursor={{ fill: '#f1f5f9' }} labelStyle={{ fontWeight: 600 }} />
                    <Bar dataKey="totalCents" name="Sales" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Sales by hour of day">
              <div className="h-64 p-4">
                <ResponsiveContainer>
                  <BarChart data={data.byHour} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(h: number) => `${h}:00`} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={56} />
                    <Tooltip formatter={tip} labelFormatter={(h) => `${h}:00 – ${Number(h) + 1}:00`} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="totalCents" name="Sales" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <BreakdownCard title="Payments by method" rows={data.byMethod.map((m) => ({ label: titleCase(m.method), value: m.amountCents, sub: `${m.count} txns` }))} cur={cur} />
            <BreakdownCard title="Sales by order type" rows={data.byType.map((t) => ({ label: titleCase(t.type), value: t.totalCents, sub: `${t.orders} orders` }))} cur={cur} />
            <BreakdownCard title="Revenue by category" rows={data.byCategory.map((c) => ({ label: c.category, value: c.revenueCents }))} cur={cur} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Top selling items">
              <Table>
                <thead className="bg-slate-50"><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Revenue</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.topItems.map((i) => <tr key={i.name}><Td className="font-medium">{i.name}</Td><Td className="tabular text-right">{i.quantity}</Td><Td className="tabular text-right">{money(i.revenueCents, cur)}</Td></tr>)}
                </tbody>
              </Table>
            </Card>
            <Card title="Staff performance">
              <Table>
                <thead className="bg-slate-50"><tr><Th>Server</Th><Th className="text-right">Orders</Th><Th className="text-right">Sales</Th><Th className="text-right">Tips</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byStaff.map((s) => <tr key={s.name}><Td className="font-medium">{s.name}</Td><Td className="tabular text-right">{s.orders}</Td><Td className="tabular text-right">{money(s.totalCents, cur)}</Td><Td className="tabular text-right">{money(s.tipCents, cur)}</Td></tr>)}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card title="Exceptions">
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Exception label="Voided items" value={`${data.voids.count}`} sub={money(data.voids.valueCents, cur)} />
              <Exception label="Cancelled orders" value={`${data.cancelledOrders}`} />
              <Exception label="Refunds" value={`${data.refunds.count}`} sub={money(data.refunds.amountCents, cur)} />
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

function BreakdownCard({ title, rows, cur }: { title: string; rows: { label: string; value: number; sub?: string }[]; cur: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <Card title={title}>
      <ul className="space-y-3 p-4">
        {[...rows].sort((a, b) => b.value - a.value).map((r) => (
          <li key={r.label} title={`${r.label}: ${money(r.value, cur)}`}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-slate-700">{r.label}{r.sub && <span className="ml-1 text-xs text-slate-400">{r.sub}</span>}</span>
              <span className="tabular font-medium text-slate-900">{money(r.value, cur)} <span className="text-xs font-normal text-slate-400">{Math.round((r.value / total) * 100)}%</span></span>
            </div>
            <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(r.value / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const Exception = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="px-4 py-4">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="tabular mt-1 text-xl font-semibold">{value}{sub && <span className="ml-2 text-sm font-normal text-slate-500">{sub}</span>}</p>
  </div>
);
