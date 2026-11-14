import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { bpsToPct, pctToBps } from '../lib/format';
import { LanguageToggle, useI18n } from '../i18n';
import type { Area, DiningTable, Outlet } from '../lib/types';
import { Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs, Textarea } from '../components/ui';
import { Page } from '../components/Layout';

type Tab = 'outlet' | 'floor' | 'new-outlet' | 'account';

export default function SettingsPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tabs = [
    can('outlet:manage') && { value: 'outlet' as Tab, label: t('set.outlet') },
    can('tables:manage') && { value: 'floor' as Tab, label: t('set.floor') },
    can('outlet:manage') && { value: 'new-outlet' as Tab, label: t('set.newOutlet') },
    { value: 'account' as Tab, label: t('set.account') },
  ].filter(Boolean) as { value: Tab; label: string }[];
  const tab = (tabs.find((t) => t.value === params.get('tab'))?.value ?? tabs[0]!.value);

  return (
    <Page>
      <PageHeader title={t('set.title')} />
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
  const { t } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: existing?.name ?? '', address: existing?.address ?? '', phone: existing?.phone ?? '',
    currency: existing?.currency ?? 'INR', timezone: existing?.timezone ?? 'Asia/Kolkata',
    tax: existing ? bpsToPct(existing.taxRateBps) : '5', service: existing ? bpsToPct(existing.serviceChargeBps) : '0',
    receiptFooter: existing?.receiptFooter ?? '', legalName: existing?.legalName ?? '', gstin: existing?.gstin ?? '',
    fssaiNumber: existing?.fssaiNumber ?? '', upiVpa: existing?.upiVpa ?? '', invoicePrefix: existing?.invoicePrefix ?? 'INV',
  });
  const [roundOff, setRoundOff] = useState(existing?.roundOff ?? true);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, address: f.address || null, phone: f.phone || null, currency: f.currency, timezone: f.timezone,
        taxRateBps: pctToBps(f.tax), serviceChargeBps: pctToBps(f.service), receiptFooter: f.receiptFooter || null,
        legalName: f.legalName || null, gstin: f.gstin || null, fssaiNumber: f.fssaiNumber || null, upiVpa: f.upiVpa || null,
        invoicePrefix: f.invoicePrefix || 'INV', roundOff,
      };
      return existing ? api.put<Outlet>(`/outlets/${existing.id}`, body) : api.post<Outlet>('/outlets', body);
    },
    onSuccess: async (o) => {
      await reload();
      qc.invalidateQueries({ queryKey: ['outlet'] });
      toast.success(existing ? t('set.saved') : t('set.created', { name: o.name }));
      if (!existing) setOutletId(o.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card className="max-w-3xl p-6">
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('set.outletName')}><Input required value={f.name} onChange={set('name')} /></Field>
        <Field label={t('set.legalName')}><Input value={f.legalName} onChange={set('legalName')} /></Field>
        <Field label={t('set.address')} className="sm:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label={t('common.phone')}><Input value={f.phone} onChange={set('phone')} placeholder="+91 44 0000 0000" /></Field>
        <Field label={t('set.upi')} hint={t('set.upiHint')}><Input value={f.upiVpa} onChange={set('upiVpa')} placeholder="shopname@okaxis" /></Field>
        <Field label={t('set.gstin')} hint={t('set.gstinHint')}><Input value={f.gstin} maxLength={15} className="font-mono uppercase" onChange={set('gstin')} /></Field>
        <Field label={t('set.fssai')} hint={t('set.fssaiHint')}><Input value={f.fssaiNumber} maxLength={14} inputMode="numeric" className="font-mono" onChange={set('fssaiNumber')} /></Field>
        <Field label={t('set.taxRate')} hint={t('set.taxHint')}><Input inputMode="decimal" value={f.tax} onChange={set('tax')} /></Field>
        <Field label={t('set.service')} hint={t('set.serviceHint')}><Input inputMode="decimal" value={f.service} onChange={set('service')} /></Field>
        <Field label={t('set.invoicePrefix')} hint={t('set.invoiceHint')}><Input value={f.invoicePrefix} maxLength={6} className="font-mono uppercase" onChange={set('invoicePrefix')} /></Field>
        <Field label={t('set.timezone')}><Input required value={f.timezone} onChange={set('timezone')} /></Field>
        <div className="sm:col-span-2"><Checkbox label={t('set.roundOff')} checked={roundOff} onChange={setRoundOff} /></div>
        <Field label={t('set.footer')} className="sm:col-span-2"><Textarea rows={2} value={f.receiptFooter} onChange={set('receiptFooter')} /></Field>
        <div className="sm:col-span-2"><Button type="submit" loading={save.isPending}>{existing ? t('set.saveChanges') : t('set.createOutlet')}</Button></div>
      </form>
    </Card>
  );
}

function FloorSettings() {
  const { outlet, base } = useOutlet();
  const { t } = useI18n();
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
      <div className="flex justify-end"><Button onClick={() => setArea('new')}><Plus className="h-4 w-4" />{t('set.addArea')}</Button></div>
      {data.areas.length === 0 && <Card><EmptyState title={t('set.noAreas')} description={t('set.noAreasDesc')} /></Card>}
      {data.areas.map((a) => {
        const tables = data.tables.filter((tb) => tb.areaId === a.id);
        return (
          <Card key={a.id} title={t('set.areaTables', { name: a.name, n: tables.length })} actions={
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => setTable({ areaId: a.id })}><Plus className="h-3.5 w-3.5" />{t('set.table')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setArea(a)} aria-label={t('set.editArea')}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => delArea.mutate(a.id)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>}>
            <div className="flex flex-wrap gap-2 p-4">
              {tables.length === 0 && <p className="text-sm text-slate-500">{t('set.noTablesInArea')}</p>}
              {tables.map((tb) => (
                <div key={tb.id} className="flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-slate-200">
                  <span className="font-semibold">{tb.label}</span>
                  <span className="text-xs text-slate-500">{t('common.seats', { n: tb.seats })}</span>
                  <button onClick={() => setTable(tb)} className="text-slate-400 hover:text-slate-700" aria-label={t('set.editTable', { label: tb.label })}><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setRemoveTable(tb)} className="text-slate-400 hover:text-red-600" aria-label={t('set.removeTable', { label: tb.label })}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {area && <AreaForm area={area === 'new' ? null : area} onClose={() => setArea(null)} />}
      {table && <TableForm table={table} areas={data.areas} onClose={() => setTable(null)} />}
      <ConfirmDialog open={!!removeTable} title={t('set.removeTable', { label: removeTable?.label ?? '' })} confirmLabel={t('common.remove')} loading={delTable.isPending}
        message={t('set.removeTableMsg')} onClose={() => setRemoveTable(null)} onConfirm={() => delTable.mutate(removeTable!.id)} />
    </div>
  );
}

function AreaForm({ area, onClose }: { area: Area | null; onClose: () => void }) {
  const { base } = useOutlet();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState(area?.name ?? '');
  const [sortOrder, setSort] = useState(area?.sortOrder ?? 0);
  const save = useMutation({
    mutationFn: () => area ? api.put(`${base}/areas/${area.id}`, { name, sortOrder }) : api.post(`${base}/areas`, { name, sortOrder }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['floor'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={area ? t('set.editArea') : t('set.newArea')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button form="area-form" type="submit" loading={save.isPending}>{t('common.save')}</Button></>}>
      <form id="area-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('common.name')}><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t('menu.displayOrder')}><Input type="number" min={0} value={sortOrder} onChange={(e) => setSort(Number(e.target.value))} /></Field>
      </form>
    </Modal>
  );
}

function TableForm({ table, areas, onClose }: { table: DiningTable | { areaId: string }; areas: Area[]; onClose: () => void }) {
  const { base } = useOutlet();
  const { t } = useI18n();
  const qc = useQueryClient();
  const existing = 'id' in table ? table : null;
  const [f, setF] = useState({ areaId: table.areaId, label: existing?.label ?? '', seats: existing?.seats ?? 4, shape: existing?.shape ?? 'SQUARE' });
  const save = useMutation({
    mutationFn: () => existing ? api.put(`${base}/tables/${existing.id}`, f) : api.post(`${base}/tables`, f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['floor'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={existing ? t('set.editTable', { label: existing.label }) : t('set.newTable')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button form="table-form" type="submit" loading={save.isPending}>{t('common.save')}</Button></>}>
      <form id="table-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('set.label')}><Input required maxLength={20} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} autoFocus placeholder="A1" /></Field>
        <Field label={t('set.seats')}><Input type="number" min={1} max={50} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} /></Field>
        <Field label={t('set.area')}><Select value={f.areaId} onChange={(e) => setF({ ...f, areaId: e.target.value })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label={t('set.shape')}><Select value={f.shape} onChange={(e) => setF({ ...f, shape: e.target.value })}>{(['SQUARE', 'ROUND', 'RECT'] as const).map((s) => <option key={s} value={s}>{t(`shape.${s}`)}</option>)}</Select></Field>
      </form>
    </Modal>
  );
}

function AccountSettings() {
  const { session, logout } = useAuth();
  const { t } = useI18n();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: cur, newPassword: next }),
    onSuccess: async () => { toast.success(t('set.passwordChanged')); await logout(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card className="max-w-lg p-6">
      <p className="text-sm text-slate-600">{t('set.signedInAs')} <strong>{session?.user.email}</strong></p>
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">{t('common.language')}</p>
        <LanguageToggle />
        <p className="mt-2 text-xs text-slate-500">{t('set.languageHint')}</p>
      </div>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
        <Field label={t('set.currentPassword')}><Input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label={t('set.newPassword')} hint={t('set.newPasswordHint')}>
          <Input type="password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" loading={change.isPending}>{t('set.changePassword')}</Button>
      </form>
    </Card>
  );
}
