import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Phone, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { RESERVATION_TRANSITIONS, type ReservationStatus } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { time } from '../lib/format';
import { useI18n } from '../i18n';
import type { DiningTable, Reservation } from '../lib/types';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, Textarea } from '../components/ui';
import { Page } from '../components/Layout';
import { ReservationStatusBadge } from '../components/status';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Reservations() {
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null);
  const from = day.toISOString();
  const to = new Date(day.getTime() + 86_400_000).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', outlet.id, from],
    queryFn: () => api.get<Reservation[]>(`${base}/reservations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) => api.patch(`${base}/reservations/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservations'] }); toast.success(t('res.updated')); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const shift = (n: number) => setDay(new Date(day.getTime() + n * 86_400_000));
  const covers = (data ?? []).filter((r) => ['BOOKED', 'SEATED'].includes(r.status)).reduce((a, r) => a + r.partySize, 0);

  return (
    <Page>
      <PageHeader title={t('res.title')} description={t('res.subtitle', { n: data?.length ?? 0, covers })}
        actions={can('reservations:manage') && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />{t('res.new')}</Button>} />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => shift(-1)} aria-label={t('res.prevDay')}><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" className="w-44" value={dayKey(day)} onChange={(e) => { const [y, m, d] = e.target.value.split('-').map(Number); if (y && m && d) setDay(new Date(y, m - 1, d)); }} />
        <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label={t('res.nextDay')}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDay(d); }}>{t('common.today')}</Button>
      </div>
      <Card>
        {isLoading ? <PageLoader /> : !data?.length ? (
          <EmptyState icon={<CalendarDays className="h-10 w-10" />} title={t('res.none')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="w-20 text-center">
                  <p className="tabular text-lg font-semibold">{time(r.reservedFor, outlet.timezone)}</p>
                  <p className="text-xs text-slate-500">{t('common.minutes', { n: r.durationMin })}</p>
                </div>
                <div className="min-w-48 flex-1">
                  <p className="font-medium text-slate-900">{r.customerName}</p>
                  <p className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.customerPhone}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{r.partySize}</span>
                    <span>{r.tableLabel ? t('floor.table', { label: r.tableLabel }) : t('res.noTable')}</span>
                  </p>
                  {r.notes && <p className="mt-0.5 text-xs italic text-slate-600">{r.notes}</p>}
                </div>
                <ReservationStatusBadge status={r.status} />
                {can('reservations:manage') && (
                  <div className="flex flex-wrap gap-1">
                    {RESERVATION_TRANSITIONS[r.status].map((s) => (
                      <Button key={s} size="sm" variant={s === 'SEATED' || s === 'COMPLETED' ? 'primary' : 'secondary'}
                        onClick={() => setStatus.mutate({ id: r.id, status: s })} disabled={setStatus.isPending}>
                        {s === 'SEATED' ? t('res.seat') : t(`resStatus.${s}`)}
                      </Button>
                    ))}
                    {r.status === 'BOOKED' && <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>{t('common.edit')}</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <ReservationForm reservation={editing === 'new' ? null : editing} defaultDay={day} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function ReservationForm({ reservation, defaultDay, onClose }: { reservation: Reservation | null; defaultDay: Date; onClose: () => void }) {
  const { outlet, base } = useOutlet();
  const qc = useQueryClient();
  const { t } = useI18n();
  const tablesQ = useQuery({ queryKey: ['floor', outlet.id], queryFn: () => api.get<{ tables: DiningTable[] }>(`${base}/floor`) });
  const initial = new Date(defaultDay); initial.setHours(19, 0, 0, 0);
  const [f, setF] = useState({
    customerName: reservation?.customerName ?? '', customerPhone: reservation?.customerPhone ?? '',
    customerEmail: reservation?.customerEmail ?? '', partySize: reservation?.partySize ?? 2,
    reservedFor: toLocalInput(reservation?.reservedFor ?? initial.toISOString()),
    durationMin: reservation?.durationMin ?? 90, tableId: reservation?.tableId ?? '', notes: reservation?.notes ?? '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, reservedFor: new Date(f.reservedFor).toISOString(), tableId: f.tableId || null, customerEmail: f.customerEmail || null, notes: f.notes || null };
      return reservation ? api.put(`${base}/reservations/${reservation.id}`, body) : api.post(`${base}/reservations`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservations'] }); toast.success(t('res.saved')); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: ['partySize', 'durationMin'].includes(k) ? Number(e.target.value) : e.target.value });
  return (
    <Modal open onClose={onClose} title={reservation ? t('res.edit') : t('res.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button form="res-form" type="submit" loading={save.isPending}>{t('common.save')}</Button></>}>
      <form id="res-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('res.guestName')} className="col-span-2"><Input required value={f.customerName} onChange={set('customerName')} /></Field>
        <Field label={t('common.phone')}><Input required placeholder="+91 98400 00000" value={f.customerPhone} onChange={set('customerPhone')} /></Field>
        <Field label={t('common.email')}><Input type="email" value={f.customerEmail} onChange={set('customerEmail')} /></Field>
        <Field label={t('res.dateTime')}><Input type="datetime-local" required value={f.reservedFor} onChange={set('reservedFor')} /></Field>
        <Field label={t('res.partySize')}><Input type="number" min={1} max={100} required value={f.partySize} onChange={set('partySize')} /></Field>
        <Field label={t('res.duration')}><Input type="number" min={15} max={600} step={15} value={f.durationMin} onChange={set('durationMin')} /></Field>
        <Field label={t('res.table')}>
          <Select value={f.tableId} onChange={set('tableId')}>
            <option value="">{t('res.assignLater')}</option>
            {(tablesQ.data?.tables ?? []).filter((tb) => tb.seats >= f.partySize).map((tb) => <option key={tb.id} value={tb.id}>{tb.label} ({t('common.seats', { n: tb.seats })})</option>)}
          </Select>
        </Field>
        <Field label={t('common.notes')} className="col-span-2"><Textarea rows={2} value={f.notes} onChange={set('notes')} placeholder={t('res.notesPh')} /></Field>
      </form>
    </Modal>
  );
}
