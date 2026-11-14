import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, download, errorMessage } from '../lib/api';
import { useOutlet } from '../lib/auth';
import { bpsToPct, money, moneyCompact } from '../lib/format';
import { useI18n } from '../i18n';
import type { OrderType, PaymentMethod } from '@tablewise/shared';
import { Button, Card, EmptyState, PageHeader, PageLoader, Stat, Table, Tabs, Td, Th } from '../components/ui';
import { Page } from '../components/Layout';

interface SalesReport {
  summary: {
    orders: number; grossCents: number; discountCents: number; serviceChargeCents: number; taxCents: number;
    totalCents: number; tipCents: number; roundOffCents: number; guests: number; netSalesCents: number; avgOrderCents: number; avgTurnMin: number;
  };
  byDay: { day: string; totalCents: number; orders: number }[];
  byHour: { hour: number; totalCents: number; orders: number }[];
  byType: { type: OrderType; totalCents: number; orders: number }[];
  byMethod: { method: PaymentMethod; amountCents: number; count: number }[];
  topItems: { name: string; nameTa: string | null; quantity: number; revenueCents: number }[];
  byCategory: { category: string; categoryTa: string | null; revenueCents: number }[];
  byStaff: { name: string; orders: number; totalCents: number; tipCents: number }[];
  gst: { rateBps: number; taxableCents: number; taxCents: number; cgstCents: number; sgstCents: number }[];
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
  const { t, dish } = useI18n();
  const [range, setRange] = useState<Range>('7d');
  const { from, to } = useMemo(() => rangeDates(range), [range]);
  const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const { data, isLoading } = useQuery({
    queryKey: ['reports', outlet.id, range],
    queryFn: () => api.get<SalesReport>(`${base}/reports/sales?${qs}`),
  });
  const compact = (c: number) => moneyCompact(c);
  const tip = (v: unknown) => money(Number(v));

  return (
    <Page>
      <PageHeader title={t('rep.title')} description={t('rep.subtitle')}
        actions={<>
          <Tabs value={range} onChange={setRange} tabs={[{ value: 'today', label: t('rep.today') }, { value: '7d', label: t('rep.7d') }, { value: '30d', label: t('rep.30d') }, { value: '90d', label: t('rep.90d') }]} />
          <Button variant="secondary" onClick={() => download(`${base}/reports/orders.csv?${qs}`, `orders-${range}.csv`).catch((e) => toast.error(errorMessage(e)))}>
            <Download className="h-4 w-4" />{t('rep.export')}
          </Button>
        </>} />
      {isLoading || !data ? <PageLoader /> : data.summary.orders === 0 ? (
        <Card><EmptyState title={t('rep.none')} description={t('rep.noneDesc')} /></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={t('rep.totalSales')} value={money(data.summary.totalCents)} sub={t('rep.totalSalesSub', { net: money(data.summary.netSalesCents), tax: money(data.summary.taxCents) })} />
            <Stat label={t('rep.bills')} value={data.summary.orders.toLocaleString('en-IN')} sub={t('rep.guestsN', { n: data.summary.guests })} tone="sky" />
            <Stat label={t('rep.avgBill')} value={money(data.summary.avgOrderCents)} sub={t('rep.avgTurn', { n: data.summary.avgTurnMin })} tone="violet" />
            <Stat label={t('rep.discounts')} value={money(data.summary.discountCents)} sub={t('rep.roundOffSub', { amount: money(data.summary.roundOffCents) })} tone="amber" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t('rep.byDay')}>
              <div className="h-64 p-4">
                <ResponsiveContainer>
                  <BarChart data={data.byDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={56} />
                    <Tooltip formatter={tip} cursor={{ fill: '#f1f5f9' }} labelStyle={{ fontWeight: 600 }} />
                    <Bar dataKey="totalCents" name={t('rep.sales')} fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title={t('rep.byHour')}>
              <div className="h-64 p-4">
                <ResponsiveContainer>
                  <BarChart data={data.byHour} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(h: number) => `${h}:00`} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={56} />
                    <Tooltip formatter={tip} labelFormatter={(h) => `${h}:00 – ${Number(h) + 1}:00`} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="totalCents" name={t('rep.sales')} fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <BreakdownCard title={t('rep.byMethod')} rows={data.byMethod.map((m) => ({ label: t(`payment.${m.method}`), value: m.amountCents, sub: t('rep.txns', { n: m.count }) }))} />
            <BreakdownCard title={t('rep.byType')} rows={data.byType.map((x) => ({ label: t(`orderType.${x.type}`), value: x.totalCents, sub: t('rep.ordersN', { n: x.orders }) }))} />
            <BreakdownCard title={t('rep.byCategory')} rows={data.byCategory.map((c) => ({ label: dish({ name: c.category, nameTa: c.categoryTa }), value: c.revenueCents }))} />
          </div>

          <Card title={t('rep.gst')}>
            <p className="px-4 pt-3 text-xs text-slate-500">{t('rep.gstHint')}</p>
            <Table>
              <thead className="bg-slate-50"><tr>
                <Th>{t('rep.col.rate')}</Th><Th className="text-right">{t('rep.col.taxable')}</Th><Th className="text-right">{t('rep.col.cgst')}</Th>
                <Th className="text-right">{t('rep.col.sgst')}</Th><Th className="text-right">{t('rep.col.totalTax')}</Th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.gst.map((g) => (
                  <tr key={g.rateBps}>
                    <Td className="font-medium">{bpsToPct(g.rateBps)}%</Td>
                    <Td className="tabular text-right">{money(g.taxableCents)}</Td>
                    <Td className="tabular text-right">{money(g.cgstCents)}</Td>
                    <Td className="tabular text-right">{money(g.sgstCents)}</Td>
                    <Td className="tabular text-right font-medium">{money(g.taxCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>



          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t('rep.topItems')}>
              <Table>
                <thead className="bg-slate-50"><tr><Th>{t('rep.col.item')}</Th><Th className="text-right">{t('rep.col.qty')}</Th><Th className="text-right">{t('rep.col.revenue')}</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.topItems.map((i) => <tr key={i.name}><Td className="font-medium">{dish(i)}</Td><Td className="tabular text-right">{i.quantity}</Td><Td className="tabular text-right">{money(i.revenueCents)}</Td></tr>)}
                </tbody>
              </Table>
            </Card>
            <Card title={t('rep.staff')}>
              <Table>
                <thead className="bg-slate-50"><tr><Th>{t('rep.col.server')}</Th><Th className="text-right">{t('rep.col.orders')}</Th><Th className="text-right">{t('rep.col.sales')}</Th><Th className="text-right">{t('rep.col.tips')}</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byStaff.map((s) => <tr key={s.name}><Td className="font-medium">{s.name}</Td><Td className="tabular text-right">{s.orders}</Td><Td className="tabular text-right">{money(s.totalCents)}</Td><Td className="tabular text-right">{money(s.tipCents)}</Td></tr>)}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card title={t('rep.exceptions')}>
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Exception label={t('rep.voids')} value={`${data.voids.count}`} sub={money(data.voids.valueCents)} />
              <Exception label={t('rep.cancelled')} value={`${data.cancelledOrders}`} />
              <Exception label={t('rep.refunds')} value={`${data.refunds.count}`} sub={money(data.refunds.amountCents)} />
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <Card title={title}>
      <ul className="space-y-3 p-4">
        {[...rows].sort((a, b) => b.value - a.value).map((r) => (
          <li key={r.label} title={`${r.label}: ${money(r.value)}`}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-slate-700">{r.label}{r.sub && <span className="ml-1 text-xs text-slate-400">{r.sub}</span>}</span>
              <span className="tabular font-medium text-slate-900">{money(r.value)} <span className="text-xs font-normal text-slate-400">{Math.round((r.value / total) * 100)}%</span></span>
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
