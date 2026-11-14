import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, History, PackagePlus, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { STOCK_REASONS, UNITS, type StockReason } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { dateTime, fromCents, money, titleCase, toCents } from '../lib/format';
import type { InventoryItem } from '../lib/types';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, Stat, Table, Td, Th } from '../components/ui';
import { Page } from '../components/Layout';

const qty = (n: number) => Number(n.toFixed(3)).toString();

export default function Inventory() {
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const manage = can('inventory:manage');
  const [edit, setEdit] = useState<InventoryItem | 'new' | null>(null);
  const [move, setMove] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<InventoryItem | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['inventory', outlet.id], queryFn: () => api.get<InventoryItem[]>(`${base}/inventory`) });

  if (isLoading || !data) return <Page><PageLoader /></Page>;
  const low = data.filter((i) => i.isLow);
  const value = data.reduce((a, i) => a + Math.max(0, i.quantityOnHand) * i.costPerUnitCents, 0);
  const rows = lowOnly ? low : data;

  return (
    <Page>
      <PageHeader title="Inventory" description="Track stock levels, purchases and wastage. Sales deduct stock automatically via recipes."
        actions={manage && <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add item</Button>} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Items tracked" value={data.length} icon={<Boxes className="h-5 w-5" />} />
        <Stat label="Low stock" value={low.length} tone={low.length ? 'red' : 'brand'} icon={<AlertTriangle className="h-5 w-5" />} />
        <Stat label="Stock value" value={money(Math.round(value), outlet.currency)} tone="violet" />
      </div>
      <Card actions={<label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />Show low stock only</label>} title="Stock">
        {rows.length === 0 ? <EmptyState icon={<Boxes className="h-10 w-10" />} title={lowOnly ? 'Nothing is running low' : 'No inventory items yet'} /> : (
          <Table>
            <thead className="bg-slate-50"><tr><Th>Item</Th><Th className="text-right">On hand</Th><Th className="text-right">Reorder at</Th><Th className="text-right">Unit cost</Th><Th>Status</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i) => (
                <tr key={i.id}>
                  <Td className="font-medium text-slate-900">{i.name}</Td>
                  <Td className="tabular text-right">{qty(i.quantityOnHand)} {i.unit}</Td>
                  <Td className="tabular text-right text-slate-500">{qty(i.reorderLevel)} {i.unit}</Td>
                  <Td className="tabular text-right">{money(i.costPerUnitCents, outlet.currency)}</Td>
                  <Td>{i.isLow ? <Badge tone="red">Reorder</Badge> : <Badge tone="green">OK</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {manage && <Button size="sm" variant="secondary" onClick={() => setMove(i)}><PackagePlus className="h-3.5 w-3.5" />Adjust</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setHistory(i)} aria-label="History"><History className="h-4 w-4" /></Button>
                      {manage && <Button size="sm" variant="ghost" onClick={() => setEdit(i)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {edit && <ItemForm item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {move && <MovementForm item={move} onClose={() => setMove(null)} />}
      {history && <HistoryModal item={history} onClose={() => setHistory(null)} />}
    </Page>
  );
}

function ItemForm({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const { outlet, base } = useOutlet();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: item?.name ?? '', unit: item?.unit ?? 'kg', reorderLevel: String(item?.reorderLevel ?? 0), cost: item ? fromCents(item.costPerUnitCents) : '' });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name, unit: f.unit, reorderLevel: Number(f.reorderLevel), costPerUnitCents: toCents(f.cost) };
      return item ? api.put(`${base}/inventory/${item.id}`, body) : api.post(`${base}/inventory`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'New inventory item'} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="inv-form" type="submit" loading={save.isPending}>Save</Button></>}>
      <form id="inv-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name" className="col-span-2"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Unit"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label={`Cost / unit (${outlet.currency})`}><Input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
        <Field label="Reorder level" className="col-span-2" hint="You'll be alerted when stock falls to this level."><Input inputMode="decimal" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function MovementForm({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { base } = useOutlet();
  const qc = useQueryClient();
  const [reason, setReason] = useState<StockReason>('PURCHASE');
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`${base}/inventory/${item.id}/movements`, { reason, delta: Number(delta), note: note || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Stock updated'); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={`Adjust ${item.name}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="mv-form" type="submit" loading={save.isPending} disabled={!Number(delta)}>Record</Button></>}>
      <form id="mv-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <p className="text-sm text-slate-500">Currently {qty(item.quantityOnHand)} {item.unit} on hand.</p>
        <Field label="Type"><Select value={reason} onChange={(e) => setReason(e.target.value as StockReason)}>{STOCK_REASONS.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
        <Field label={`Quantity (${item.unit})`} hint={reason === 'ADJUSTMENT' ? 'Use a negative number to reduce stock.' : reason === 'PURCHASE' ? 'Added to stock.' : 'Removed from stock.'}>
          <Input inputMode="decimal" required value={delta} onChange={(e) => setDelta(e.target.value)} autoFocus />
        </Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier invoice #, reason…" /></Field>
      </form>
    </Modal>
  );
}

function HistoryModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { outlet, base } = useOutlet();
  const { data, isLoading } = useQuery({
    queryKey: ['inventory-history', item.id],
    queryFn: () => api.get<{ id: string; delta: number; reason: StockReason; note: string | null; userName: string | null; createdAt: string }[]>(`${base}/inventory/${item.id}/movements`),
  });
  return (
    <Modal open onClose={onClose} title={`${item.name} — stock history`} size="lg">
      {isLoading ? <PageLoader /> : !data?.length ? <EmptyState title="No movements yet" /> : (
        <Table>
          <thead><tr><Th>When</Th><Th>Type</Th><Th className="text-right">Change</Th><Th>By</Th><Th>Note</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((m) => (
              <tr key={m.id}>
                <Td>{dateTime(m.createdAt, outlet.timezone)}</Td>
                <Td>{titleCase(m.reason)}</Td>
                <Td className={`tabular text-right font-medium ${m.delta < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{m.delta > 0 ? '+' : ''}{qty(m.delta)} {item.unit}</Td>
                <Td>{m.userName ?? '—'}</Td>
                <Td className="max-w-48 truncate">{m.note ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
