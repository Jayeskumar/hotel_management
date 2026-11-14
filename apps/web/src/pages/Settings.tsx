import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { bpsToPct, pctToBps } from '../lib/format';
import type { Area, DiningTable, Outlet } from '../lib/types';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs, Textarea } from '../components/ui';
import { Page } from '../components/Layout';

type Tab = 'outlet' | 'floor' | 'new-outlet' | 'account';

export default function SettingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [
    can('outlet:manage') && { value: 'outlet' as Tab, label: 'Outlet' },
    can('tables:manage') && { value: 'floor' as Tab, label: 'Floor plan' },
    can('outlet:manage') && { value: 'new-outlet' as Tab, label: 'Add outlet' },
    { value: 'account' as Tab, label: 'My account' },
  ].filter(Boolean) as { value: Tab; label: string }[];
  const tab = (tabs.find((t) => t.value === params.get('tab'))?.value ?? tabs[0]!.value);

  return (
    <Page>
      <PageHeader title="Settings" />
      <div className="mb-6"><Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={tabs} /></div>
      {tab === 'outlet' && <OutletSettings />}
      {tab === 'floor' && <FloorSettings />}
      {tab === 'new-outlet' && <OutletForm />}
      {tab === 'account' && <AccountSettings />}
    </Page>
  );
}

function OutletSettings() {
  const { outlet, base } = useOutlet();
  const { data, isLoading } = useQuery({ queryKey: ['outlet', outlet.id], queryFn: () => api.get<Outlet>(base) });
  if (isLoading || !data) return <PageLoader />;
  return <OutletForm existing={data} />;
}

function OutletForm({ existing }: { existing?: Outlet }) {
  const { reload, setOutletId } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: existing?.name ?? '', address: existing?.address ?? '', phone: existing?.phone ?? '',
    currency: existing?.currency ?? 'USD', timezone: existing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    tax: existing ? bpsToPct(existing.taxRateBps) : '0', service: existing ? bpsToPct(existing.serviceChargeBps) : '0',
    receiptFooter: existing?.receiptFooter ?? '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, address: f.address || null, phone: f.phone || null, currency: f.currency, timezone: f.timezone,
        taxRateBps: pctToBps(f.tax), serviceChargeBps: pctToBps(f.service), receiptFooter: f.receiptFooter || null,
      };
      return existing ? api.put<Outlet>(`/outlets/${existing.id}`, body) : api.post<Outlet>('/outlets', body);
    },
    onSuccess: async (o) => {
      await reload();
      qc.invalidateQueries({ queryKey: ['outlet'] });
      toast.success(existing ? 'Outlet settings saved' : `${o.name} created`);
      if (!existing) setOutletId(o.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card className="max-w-3xl p-6">
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Outlet name" className="sm:col-span-2"><Input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Currency (ISO code)"><Input required maxLength={3} value={f.currency} onChange={set('currency')} /></Field>
        <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata"><Input required value={f.timezone} onChange={set('timezone')} /></Field>
        <div />
        <Field label="Default tax rate %"><Input inputMode="decimal" value={f.tax} onChange={set('tax')} /></Field>
        <Field label="Service charge % (dine-in)"><Input inputMode="decimal" value={f.service} onChange={set('service')} /></Field>
        <Field label="Receipt footer" className="sm:col-span-2"><Textarea rows={2} value={f.receiptFooter} onChange={set('receiptFooter')} /></Field>
        <div className="sm:col-span-2"><Button type="submit" loading={save.isPending}>{existing ? 'Save changes' : 'Create outlet'}</Button></div>
      </form>
    </Card>
  );
}

function FloorSettings() {
  const { outlet, base } = useOutlet();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['floor', outlet.id], queryFn: () => api.get<{ areas: Area[]; tables: DiningTable[] }>(`${base}/floor`) });
  const [area, setArea] = useState<Area | 'new' | null>(null);
  const [table, setTable] = useState<DiningTable | { areaId: string } | null>(null);
  const [removeTable, setRemoveTable] = useState<DiningTable | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['floor'] });
  const delArea = useMutation({ mutationFn: (id: string) => api.del(`${base}/areas/${id}`), onSuccess: inv, onError: (e) => toast.error(errorMessage(e)) });
  const delTable = useMutation({
    mutationFn: (id: string) => api.del(`${base}/tables/${id}`),
    onSuccess: () => { inv(); setRemoveTable(null); }, onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !data) return <PageLoader />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setArea('new')}><Plus className="h-4 w-4" />Add area</Button></div>
      {data.areas.length === 0 && <Card><EmptyState title="No dining areas" description="Create an area like Main Hall, Patio or Bar, then add tables to it." /></Card>}
      {data.areas.map((a) => {
        const tables = data.tables.filter((t) => t.areaId === a.id);
        return (
          <Card key={a.id} title={`${a.name} (${tables.length} tables)`} actions={
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => setTable({ areaId: a.id })}><Plus className="h-3.5 w-3.5" />Table</Button>
              <Button size="sm" variant="ghost" onClick={() => setArea(a)} aria-label="Edit area"><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => delArea.mutate(a.id)} aria-label="Delete area"><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>}>
            <div className="flex flex-wrap gap-2 p-4">
              {tables.length === 0 && <p className="text-sm text-slate-500">No tables in this area.</p>}
              {tables.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-slate-200">
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-xs text-slate-500">{t.seats} seats</span>
                  <button onClick={() => setTable(t)} className="text-slate-400 hover:text-slate-700" aria-label={`Edit ${t.label}`}><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setRemoveTable(t)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${t.label}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {area && <AreaForm area={area === 'new' ? null : area} onClose={() => setArea(null)} />}
      {table && <TableForm table={table} areas={data.areas} onClose={() => setTable(null)} />}
      <ConfirmDialog open={!!removeTable} title={`Remove table ${removeTable?.label ?? ''}?`} confirmLabel="Remove" loading={delTable.isPending}
        message="The table is hidden from the floor; its order history is kept." onClose={() => setRemoveTable(null)} onConfirm={() => delTable.mutate(removeTable!.id)} />
    </div>
  );
}

function AreaForm({ area, onClose }: { area: Area | null; onClose: () => void }) {
  const { base } = useOutlet();
  const qc = useQueryClient();
  const [name, setName] = useState(area?.name ?? '');
  const [sortOrder, setSort] = useState(area?.sortOrder ?? 0);
  const save = useMutation({
    mutationFn: () => area ? api.put(`${base}/areas/${area.id}`, { name, sortOrder }) : api.post(`${base}/areas`, { name, sortOrder }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['floor'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={area ? 'Edit area' : 'New area'} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="area-form" type="submit" loading={save.isPending}>Save</Button></>}>
      <form id="area-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Display order"><Input type="number" min={0} value={sortOrder} onChange={(e) => setSort(Number(e.target.value))} /></Field>
      </form>
    </Modal>
  );
}

function TableForm({ table, areas, onClose }: { table: DiningTable | { areaId: string }; areas: Area[]; onClose: () => void }) {
  const { base } = useOutlet();
  const qc = useQueryClient();
  const existing = 'id' in table ? table : null;
  const [f, setF] = useState({ areaId: table.areaId, label: existing?.label ?? '', seats: existing?.seats ?? 4, shape: existing?.shape ?? 'SQUARE' });
  const save = useMutation({
    mutationFn: () => existing ? api.put(`${base}/tables/${existing.id}`, f) : api.post(`${base}/tables`, f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['floor'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={existing ? `Edit table ${existing.label}` : 'New table'} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="table-form" type="submit" loading={save.isPending}>Save</Button></>}>
      <form id="table-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Label"><Input required maxLength={20} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} autoFocus placeholder="T1" /></Field>
        <Field label="Seats"><Input type="number" min={1} max={50} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} /></Field>
        <Field label="Area"><Select value={f.areaId} onChange={(e) => setF({ ...f, areaId: e.target.value })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Shape"><Select value={f.shape} onChange={(e) => setF({ ...f, shape: e.target.value })}><option value="SQUARE">Square</option><option value="ROUND">Round</option><option value="RECT">Rectangle</option></Select></Field>
      </form>
    </Modal>
  );
}

function AccountSettings() {
  const { session, logout } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: cur, newPassword: next }),
    onSuccess: async () => { toast.success('Password changed. Please sign in again.'); await logout(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card className="max-w-lg p-6">
      <p className="text-sm text-slate-600">Signed in as <strong>{session?.user.email}</strong></p>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
        <Field label="Current password"><Input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" hint="At least 10 characters with a letter and a number. Signs out all other sessions.">
          <Input type="password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" loading={change.isPending}>Change password</Button>
      </form>
    </Card>
  );
}
