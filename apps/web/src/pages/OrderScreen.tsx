import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { clsx } from 'clsx';
import QRCode from 'qrcode';
import {
  ArrowLeft, Ban, CheckCheck, ChefHat, Leaf, Minus, Percent, Plus, Printer, ReceiptText, Search, Send, Trash2, Undo2, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { computeBillDetail, PAYMENT_METHODS, splitGst, type PaymentMethod } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { dateTime, elapsed, fromCents, money, time, toCents } from '../lib/format';
import { useI18n } from '../i18n';
import type { Category, DiningTable, MenuItem, OrderDetail, OrderItem } from '../lib/types';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageLoader, Select, Tabs, Textarea } from '../components/ui';
import { ItemStatusBadge, OrderStatusBadge } from '../components/status';
import { PrintArea, type PrintMode } from '../components/Print';

export default function OrderScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const { t, dish, dishAlt, lang } = useI18n();
  const qc = useQueryClient();
  const nav = useNavigate();

  const orderQ = useQuery({ queryKey: ['order', orderId], queryFn: () => api.get<OrderDetail>(`${base}/orders/${orderId}`) });
  const menuQ = useQuery({ queryKey: ['menu', outlet.id], queryFn: () => api.get<{ categories: Category[]; items: MenuItem[] }>(`${base}/menu`) });

  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [modItem, setModItem] = useState<MenuItem | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [voidItem, setVoidItem] = useState<OrderItem | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>('invoice');

  const print = (mode: PrintMode) => {
    setPrintMode(mode);
    setTimeout(() => window.print(), 50);
  };

  const setOrder = (o: OrderDetail) => {
    qc.setQueryData(['order', orderId], o);
    qc.invalidateQueries({ queryKey: ['floor'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };
  const mut = <V,>(fn: (v: V) => Promise<OrderDetail>, success?: () => string) => ({
    mutationFn: fn,
    onSuccess: (o: OrderDetail) => { setOrder(o); if (success) toast.success(success()); },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });

  const addItem = useMutation(mut((v: { menuItemId: string; quantity: number; modifiers: string[]; notes?: string }) =>
    api.post<OrderDetail>(`${base}/orders/${orderId}/items`, { items: [v] })));
  const setQty = useMutation(mut((v: { itemId: string; quantity: number }) =>
    api.patch<OrderDetail>(`${base}/orders/${orderId}/items/${v.itemId}`, { quantity: v.quantity })));
  const removeItem = useMutation(mut((v: { itemId: string; reason?: string }) =>
    api.post<OrderDetail>(`${base}/orders/${orderId}/items/${v.itemId}/void`, { reason: v.reason })));
  const fire = useMutation(mut(() => api.post<OrderDetail>(`${base}/orders/${orderId}/fire`), () => t('order.sentToKitchen')));
  const serve = useMutation(mut((itemId: string) => api.post<OrderDetail>(`${base}/orders/${orderId}/items/${itemId}/serve`)));
  const cancel = useMutation(mut((reason: string) => api.post<OrderDetail>(`${base}/orders/${orderId}/cancel`, { reason }), () => t('order.cancelled')));
  const refund = useMutation(mut((v: { paymentId: string; reason: string }) =>
    api.post<OrderDetail>(`${base}/orders/${orderId}/payments/${v.paymentId}/refund`, { reason: v.reason }), () => t('order.paymentRefunded')));
  const serviceCharge = useMutation(mut((enabled: boolean) => api.post<OrderDetail>(`${base}/orders/${orderId}/service-charge`, { enabled })));

  const visibleItems = useMemo(() => {
    const items = menuQ.data?.items ?? [];
    const activeCats = new Set(menuQ.data?.categories.filter((c) => c.isActive).map((c) => c.id));
    const q = search.trim().toLowerCase();
    return items.filter((i) => activeCats.has(i.categoryId) && (cat === 'all' || i.categoryId === cat)
      && (!q || i.name.toLowerCase().includes(q) || i.nameTa?.includes(search.trim()) || i.sku?.toLowerCase().includes(q)));
  }, [menuQ.data, cat, search]);

  if (orderQ.isLoading || menuQ.isLoading) return <PageLoader />;
  if (orderQ.error || !orderQ.data) return <EmptyState title={t('order.notFound')} action={<Button onClick={() => nav('/floor')}>{t('order.backToFloor')}</Button>} />;
  const order = orderQ.data;
  const open = order.status === 'OPEN';
  const pending = order.items.filter((i) => i.status === 'PENDING');
  const live = order.items.filter((i) => i.status !== 'VOIDED');
  const canEdit = open && can('orders:update');
  const gst = computeBillDetail({
    lines: live.map((i) => ({ unitPriceCents: i.unitPriceCents, quantity: i.quantity, taxRateBps: i.taxRateBps, modifiersCents: i.modifiersCents })),
    discount: order.discount, serviceChargeBps: order.serviceChargeBps,
  }).taxBreakdown;
  const modName = (m: { name: string; nameTa?: string | null }) => (lang === 'ta' && m.nameTa) || m.name;

  const onPick = (item: MenuItem) => {
    if (!canEdit) return;
    if (!item.isAvailable) return toast.error(t('order.unavailableToast', { item: dish(item) }));
    if (item.modifiers.length) setModItem(item);
    else addItem.mutate({ menuItemId: item.id, quantity: 1, modifiers: [] });
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Menu */}
      <section className={clsx('flex min-h-0 flex-1 flex-col border-slate-200 lg:border-r', !canEdit && 'hidden lg:flex')}>
        <div className="space-y-3 border-b border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <Link to={order.type === 'DINE_IN' ? '/floor' : '/orders'} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('common.back')}><ArrowLeft className="h-5 w-5" /></Link>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder={t('order.searchMenu')} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <Tabs value={cat} onChange={setCat} tabs={[{ value: 'all', label: t('common.all') },
            ...(menuQ.data?.categories ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: dish(c) }))]} />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!canEdit && open && <p className="mb-3 text-sm text-slate-500">{t('order.viewOnly')}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <button key={item.id} onClick={() => onPick(item)} disabled={!canEdit || addItem.isPending}
                className={clsx('flex min-h-24 flex-col justify-between rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-500 disabled:cursor-not-allowed',
                  !item.isAvailable && 'opacity-50')}>
                <div className="flex items-start justify-between gap-1">
                  <span>
                    <span className="block text-sm font-medium leading-snug text-slate-900">{dish(item)}</span>
                    {dishAlt(item) && <span className="block text-xs leading-snug text-slate-500">{dishAlt(item)}</span>}
                  </span>
                  <VegMark veg={item.isVeg} />
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="tabular text-sm font-semibold text-brand-800">{money(item.priceCents)}</span>
                  {!item.isAvailable ? <Badge tone="red">{t('order.unavailable')}</Badge> : item.modifiers.length > 0 && <span className="text-[10px] uppercase text-slate-400">{t('order.options')}</span>}
                </div>
              </button>
            ))}
          </div>
          {visibleItems.length === 0 && <EmptyState title={t('order.noMenuItems')} description={t('order.noMatch')} />}
        </div>
      </section>

      {/* Ticket */}
      <aside className="flex min-h-0 w-full flex-col bg-white lg:w-[420px] xl:w-[460px]">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">
                {t('order.title', { n: order.orderNumber })}
                <span className="ml-2 text-sm font-normal text-slate-500">{order.table ? t('floor.table', { label: order.table.label }) : t(`orderType.${order.type}`)}</span>
              </h1>
              <p className="text-xs text-slate-500">
                {t('order.opened', { time: time(order.openedAt, outlet.timezone), elapsed: elapsed(order.openedAt) })} · {t('common.guests', { n: order.guestCount })}
                {order.customerName && ` · ${order.customerName}`}
              </p>
              {order.invoiceNumber && <p className="mt-0.5 font-mono text-xs text-slate-600">{t('order.invoiceNo', { n: order.invoiceNumber })}</p>}
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          {open && order.type === 'DINE_IN' && can('orders:update') && (
            <button className="mt-2 text-xs font-medium text-brand-700 hover:underline" onClick={() => setShowMove(true)}>{t('order.moveTable')}</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {order.items.length === 0 ? (
            <EmptyState title={t('order.noItems')} description={t('order.noItemsDesc')} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {order.items.map((it) => (
                <li key={it.id} className={clsx('px-4 py-3', it.status === 'VOIDED' && 'bg-slate-50 opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-sm font-medium', it.status === 'VOIDED' && 'line-through')}>
                        <span className="tabular mr-1 text-slate-500">{it.quantity}×</span>{dish(it)}
                      </p>
                      {dishAlt(it) && <p className="text-xs text-slate-400">{dishAlt(it)}</p>}
                      {it.modifiers.length > 0 && <p className="text-xs text-slate-500">+ {it.modifiers.map(modName).join(', ')}</p>}
                      {it.notes && <p className="text-xs italic text-amber-700">“{it.notes}”</p>}
                      {it.voidReason && <p className="text-xs text-red-600">{t('order.voidLabel', { reason: it.voidReason })}</p>}
                      <div className="mt-1 flex items-center gap-2"><ItemStatusBadge status={it.status} /></div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="tabular text-sm font-medium">{money((it.unitPriceCents + it.modifiersCents) * it.quantity)}</span>
                      {canEdit && it.status === 'PENDING' && (
                        <div className="flex items-center gap-1">
                          <IconBtn label={t('order.decrease')} onClick={() => it.quantity > 1 ? setQty.mutate({ itemId: it.id, quantity: it.quantity - 1 }) : removeItem.mutate({ itemId: it.id })}><Minus className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label={t('order.increase')} onClick={() => setQty.mutate({ itemId: it.id, quantity: it.quantity + 1 })}><Plus className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label={t('common.remove')} onClick={() => removeItem.mutate({ itemId: it.id })}><Trash2 className="h-3.5 w-3.5 text-red-600" /></IconBtn>
                        </div>
                      )}
                      {open && it.status === 'READY' && can('orders:update') && (
                        <Button size="sm" variant="success" onClick={() => serve.mutate(it.id)}><CheckCheck className="h-3.5 w-3.5" />{t('order.served')}</Button>
                      )}
                      {open && ['QUEUED', 'PREPARING', 'READY', 'SERVED'].includes(it.status) && can('orders:void_item') && (
                        <button className="text-xs text-red-600 hover:underline" onClick={() => setVoidItem(it)}>{t('order.void')}</button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {order.payments.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('order.payments')}</p>
              <ul className="space-y-1.5">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className={clsx(p.status === 'REFUNDED' && 'line-through text-slate-400')}>
                      {t(`payment.${p.method}`)} {p.reference && <span className="text-xs text-slate-400">({p.reference})</span>}
                      {p.tipCents > 0 && <span className="text-xs text-slate-500"> {t('order.tip', { amount: money(p.tipCents) })}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{money(p.amountCents)}</span>
                      {p.status === 'REFUNDED' ? <Badge tone="red">{t('order.refunded')}</Badge>
                        : can('payments:refund') && <button onClick={() => setRefundId(p.id)} className="text-slate-400 hover:text-red-600" title={t('order.refund')} aria-label={t('order.refund')}><Undo2 className="h-4 w-4" /></button>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Totals + actions */}
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <dl className="space-y-1 text-sm">
            <Row label={t('order.subtotal')} value={money(order.subtotalCents)} />
            {order.discountCents > 0 && <Row label={`${t('order.discount')}${order.discountReason ? ` (${order.discountReason})` : ''}`} value={`−${money(order.discountCents)}`} className="text-emerald-700" />}
            {order.serviceChargeCents > 0 && <Row label={t('order.serviceCharge', { pct: order.serviceChargeBps / 100 })} value={money(order.serviceChargeCents)} />}
            {gst.map((b) => {
              const { cgstCents, sgstCents } = splitGst(b.taxCents);
              return (
                <div key={b.rateBps} className="space-y-1 text-slate-600">
                  <Row label={t('order.cgst', { pct: b.rateBps / 200 })} value={money(cgstCents)} />
                  <Row label={t('order.sgst', { pct: b.rateBps / 200 })} value={money(sgstCents)} />
                </div>
              );
            })}
            {order.roundOffCents !== 0 && <Row label={t('order.roundOff')} value={`${order.roundOffCents > 0 ? '+' : '−'}${money(Math.abs(order.roundOffCents))}`} className="text-slate-500" />}
            <Row label={t('order.total')} value={money(order.totalCents)} className="pt-1 text-base font-semibold text-slate-900" />
            {order.paidCents > 0 && <Row label={t('order.paid')} value={money(order.paidCents)} />}
            {open && order.paidCents > 0 && <Row label={t('order.balance')} value={money(order.balanceCents)} className="font-semibold text-brand-800" />}
          </dl>

          {open ? (
            <div className="mt-4 space-y-2">
              {canEdit && (
                <Button className="w-full" size="lg" disabled={!pending.length} loading={fire.isPending} onClick={() => fire.mutate(undefined)}>
                  <Send className="h-4 w-4" />{pending.length > 0 ? t('order.sendKotN', { n: pending.reduce((a, i) => a + i.quantity, 0) }) : t('order.sendKot')}
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                {can('orders:discount') && <Button variant="secondary" size="sm" onClick={() => setShowDiscount(true)} disabled={!live.length}><Percent className="h-4 w-4" />{t('order.discount')}</Button>}
                <Button variant="secondary" size="sm" onClick={() => print('kot')} disabled={!live.length}><ChefHat className="h-4 w-4" />{t('order.printKot')}</Button>
                <Button variant="secondary" size="sm" onClick={() => print('invoice')} disabled={!live.length}><Printer className="h-4 w-4" />{t('order.printBill')}</Button>
                {can('orders:cancel') && <Button variant="secondary" size="sm" onClick={() => setShowCancel(true)}><Ban className="h-4 w-4" />{t('order.cancelOrder')}</Button>}
              </div>
              {can('orders:discount') && order.type === 'DINE_IN' && outlet.serviceChargeBps > 0 && (
                <button className="w-full text-xs font-medium text-slate-600 hover:underline" onClick={() => serviceCharge.mutate(order.serviceChargeBps === 0)} disabled={serviceCharge.isPending}>
                  {order.serviceChargeBps > 0 ? t('order.removeService') : t('order.addService')}
                </button>
              )}
              {can('payments:create') && (
                <Button variant="success" className="w-full" size="lg" disabled={order.balanceCents <= 0 || pending.length > 0} onClick={() => setShowPay(true)}>
                  <Wallet className="h-4 w-4" />{pending.length > 0 ? t('order.sendBeforePay') : t('order.takePayment', { amount: money(order.balanceCents) })}
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-center text-sm text-slate-500">
                {order.status === 'COMPLETED' ? t('order.closedAt', { time: dateTime(order.closedAt, outlet.timezone) }) : t('order.cancelledReason', { reason: order.cancelReason ?? '' })}
              </p>
              {order.status === 'COMPLETED' && <Button variant="secondary" className="w-full" onClick={() => print('invoice')}><ReceiptText className="h-4 w-4" />{t('order.printInvoice')}</Button>}
            </div>
          )}
        </div>
      </aside>

      <PrintArea order={order} mode={printMode} />

      {modItem && (
        <ModifierModal item={modItem} onClose={() => setModItem(null)}
          onAdd={(v) => addItem.mutate({ menuItemId: modItem.id, ...v }, { onSuccess: () => setModItem(null) })} loading={addItem.isPending} />
      )}
      {showPay && <PaymentModal order={order} onClose={() => setShowPay(false)} onPaid={(o) => {
        setOrder(o); setShowPay(false);
        if (o.status === 'COMPLETED') toast.success(t('order.settled', { n: o.orderNumber, invoice: o.invoiceNumber ?? '' }));
      }} />}
      {showDiscount && <DiscountModal order={order} onClose={() => setShowDiscount(false)} onSaved={(o) => { setOrder(o); setShowDiscount(false); }} />}
      {showMove && <MoveTableModal order={order} onClose={() => setShowMove(false)} onMoved={(o) => { setOrder(o); setShowMove(false); }} />}
      <ConfirmDialog open={showCancel} title={t('order.cancelTitle')} requireReason confirmLabel={t('order.cancelOrder')} loading={cancel.isPending}
        message={t('order.cancelMsg')}
        onClose={() => setShowCancel(false)} onConfirm={(reason) => cancel.mutate(reason, { onSuccess: () => setShowCancel(false) })} />
      <ConfirmDialog open={!!voidItem} title={t('order.voidTitle', { item: voidItem ? dish(voidItem) : '' })} requireReason confirmLabel={t('order.voidConfirm')} loading={removeItem.isPending}
        message={t('order.voidMsg')}
        onClose={() => setVoidItem(null)} onConfirm={(reason) => removeItem.mutate({ itemId: voidItem!.id, reason }, { onSuccess: () => setVoidItem(null) })} />
      <ConfirmDialog open={!!refundId} title={t('order.refundTitle')} requireReason confirmLabel={t('order.refund')} loading={refund.isPending}
        onClose={() => setRefundId(null)} onConfirm={(reason) => refund.mutate({ paymentId: refundId!, reason }, { onSuccess: () => setRefundId(null) })} />
    </div>
  );
}

/** Indian veg / non-veg symbol: a dot inside a square, green or red. */
export function VegMark({ veg }: { veg: boolean }) {
  const { t } = useI18n();
  return (
    <span title={veg ? t('common.vegetarian') : undefined} aria-label={veg ? t('common.vegetarian') : undefined}
      className={clsx('mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border-2', veg ? 'border-emerald-600' : 'border-red-700')}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', veg ? 'bg-emerald-600' : 'bg-red-700')} />
    </span>
  );
}

const IconBtn = ({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) => (
  <button onClick={onClick} aria-label={label} className="rounded-md p-1 ring-1 ring-slate-200 hover:bg-slate-100">{children}</button>
);
const Row = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className={clsx('flex justify-between gap-2', className)}><dt>{label}</dt><dd className="tabular">{value}</dd></div>
);

function ModifierModal({ item, onClose, onAdd, loading }: {
  item: MenuItem; loading: boolean; onClose: () => void;
  onAdd: (v: { quantity: number; modifiers: string[]; notes?: string }) => void;
}) {
  const { t, dish, lang } = useI18n();
  const [mods, setMods] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const unit = item.priceCents + item.modifiers.filter((m) => mods.includes(m.name)).reduce((a, m) => a + m.priceCents, 0);
  return (
    <Modal open onClose={onClose} title={dish(item)} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={loading} onClick={() => onAdd({ quantity: qty, modifiers: mods, notes: notes || undefined })}>{t('order.addFor', { amount: money(unit * qty) })}</Button></>}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('menu.addons')}</p>
      <div className="space-y-1">
        {item.modifiers.map((m) => (
          <label key={m.name} className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
            <span className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded text-brand-700" checked={mods.includes(m.name)}
                onChange={(e) => setMods(e.target.checked ? [...mods, m.name] : mods.filter((x) => x !== m.name))} />
              {(lang === 'ta' && m.nameTa) || m.name}
            </span>
            <span className="tabular text-sm text-slate-500">{m.priceCents ? `+${money(m.priceCents)}` : t('common.free')}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Field label={t('order.qty')}><Input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></Field>
        <Field label={t('order.kitchenNote')} className="col-span-2"><Input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder={t('order.kitchenNotePh')} /></Field>
      </div>
    </Modal>
  );
}

/** Builds a UPI deep link (NPCI spec) with the exact amount so the customer can't mistype it. */
function upiLink(vpa: string, payee: string, amountCents: number, note: string) {
  const p = new URLSearchParams({ pa: vpa, pn: payee, am: (amountCents / 100).toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${p.toString()}`;
}

function PaymentModal({ order, onClose, onPaid }: { order: OrderDetail; onClose: () => void; onPaid: (o: OrderDetail) => void }) {
  const { outlet, base } = useOutlet();
  const { t } = useI18n();
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [amount, setAmount] = useState(fromCents(order.balanceCents));
  const [tip, setTip] = useState('');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  // One idempotency key per payment attempt so double-taps / retries never double-charge.
  const [key] = useState(() => crypto.randomUUID());
  const amountCents = toCents(amount);
  const tipCents = toCents(tip);
  const change = method === 'CASH' && tendered ? toCents(tendered) - amountCents - tipCents : 0;

  useEffect(() => {
    if (method !== 'UPI' || !outlet.upiVpa || amountCents <= 0) { setQr(null); return; }
    let live = true;
    QRCode.toDataURL(upiLink(outlet.upiVpa, outlet.legalName ?? outlet.name, amountCents + tipCents, `Order ${order.orderNumber}`), { margin: 1, width: 220 })
      .then((url) => live && setQr(url)).catch(() => live && setQr(null));
    return () => { live = false; };
  }, [method, amountCents, tipCents, outlet.upiVpa, outlet.legalName, outlet.name, order.orderNumber]);

  const pay = useMutation({
    mutationFn: () => api.post<OrderDetail>(`${base}/orders/${order.id}/payments`, {
      method, amountCents, tipCents, reference: reference || null, idempotencyKey: key,
    }),
    onSuccess: onPaid,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const split = (n: number) => setAmount(fromCents(Math.ceil(order.balanceCents / n)));

  return (
    <Modal open onClose={onClose} title={t('pay.title', { amount: money(order.balanceCents) })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="success" loading={pay.isPending} disabled={amountCents <= 0 || amountCents > order.balanceCents || change < 0} onClick={() => pay.mutate()}>
          {t('pay.charge', { amount: money(amountCents + tipCents) })}
        </Button></>}>
      <div className="grid grid-cols-5 gap-2">
        {PAYMENT_METHODS.map((m) => (
          <button key={m} onClick={() => setMethod(m)}
            className={clsx('rounded-lg px-1 py-3 text-sm font-medium ring-1', method === m ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white ring-slate-300 hover:bg-slate-50')}>
            {t(`payment.${m}`)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={t('pay.amount')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t('pay.tip')}><Input inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0.00" /></Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="self-center text-xs text-slate-500">{t('pay.split')}</span>
        {[2, 3, 4].map((n) => <Button key={n} size="sm" variant="secondary" onClick={() => split(n)}>1/{n}</Button>)}
        <Button size="sm" variant="secondary" onClick={() => setAmount(fromCents(order.balanceCents))}>{t('pay.full')}</Button>
      </div>
      {method === 'CASH' && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label={t('pay.cashTendered')}><Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} /></Field>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t('pay.change')}</p>
            <p className={clsx('tabular text-xl font-semibold', change < 0 ? 'text-red-600' : 'text-slate-900')}>{money(Math.max(0, change))}</p>
          </div>
        </div>
      )}
      {method === 'UPI' && (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-slate-50 p-4 text-center">
          {outlet.upiVpa ? (
            <>
              {qr && <img src={qr} alt="UPI QR" className="h-48 w-48 rounded-lg bg-white p-2 ring-1 ring-slate-200" />}
              <p className="text-sm font-medium text-slate-800">{t('pay.scanUpi')} · <span className="tabular">{money(amountCents + tipCents)}</span></p>
              <p className="font-mono text-xs text-slate-500">{outlet.upiVpa}</p>
              <p className="text-xs text-amber-700">{t('pay.upiConfirm')}</p>
            </>
          ) : <p className="text-sm text-slate-500">{t('pay.upiNotSet')}</p>}
        </div>
      )}
      {method !== 'CASH' && <Field label={t('pay.reference')} className="mt-4"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
      {amountCents > order.balanceCents && <p className="mt-3 text-sm text-red-600">{t('pay.exceeds')}</p>}
    </Modal>
  );
}

function DiscountModal({ order, onClose, onSaved }: { order: OrderDetail; onClose: () => void; onSaved: (o: OrderDetail) => void }) {
  const { base } = useOutlet();
  const { t } = useI18n();
  const [type, setType] = useState<'PERCENT' | 'FLAT'>(order.discount?.type ?? 'PERCENT');
  const [value, setValue] = useState(order.discount ? (order.discount.type === 'PERCENT' ? String(order.discount.bps / 100) : fromCents(order.discount.amountCents)) : '');
  const [reason, setReason] = useState(order.discountReason ?? '');
  const save = useMutation({
    mutationFn: (remove?: boolean) => api.post<OrderDetail>(`${base}/orders/${order.id}/discount`, {
      discount: remove ? null : type === 'PERCENT' ? { type, bps: Math.round(Number(value) * 100) } : { type, amountCents: toCents(value) },
      reason: remove ? undefined : reason || undefined,
    }),
    onSuccess: onSaved,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={t('disc.title')} size="sm"
      footer={<>
        {order.discount && <Button variant="ghost" onClick={() => save.mutate(true)}>{t('common.remove')}</Button>}
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} onClick={() => save.mutate(false)} disabled={!value}>{t('common.apply')}</Button>
      </>}>
      <Tabs value={type} onChange={setType} tabs={[{ value: 'PERCENT', label: t('disc.percent') }, { value: 'FLAT', label: t('disc.amount') }]} />
      <div className="mt-4 space-y-3">
        <Field label={type === 'PERCENT' ? t('disc.percentOff') : t('disc.amountOff')}><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
        <Field label={t('common.reason')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={t('disc.reasonPh')} /></Field>
      </div>
    </Modal>
  );
}

function MoveTableModal({ order, onClose, onMoved }: { order: OrderDetail; onClose: () => void; onMoved: (o: OrderDetail) => void }) {
  const { outlet, base } = useOutlet();
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ['floor', outlet.id], queryFn: () => api.get<{ tables: DiningTable[] }>(`${base}/floor`) });
  const [tableId, setTableId] = useState('');
  const move = useMutation({
    mutationFn: () => api.patch<OrderDetail>(`${base}/orders/${order.id}`, { tableId }),
    onSuccess: (o) => { toast.success(t('move.moved', { label: o.table?.label ?? '' })); onMoved(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const free = (data?.tables ?? []).filter((tb) => !tb.openOrder && tb.status !== 'OUT_OF_SERVICE' && tb.id !== order.tableId);
  return (
    <Modal open onClose={onClose} title={t('move.title')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!tableId} loading={move.isPending} onClick={() => move.mutate()}>{t('move.move')}</Button></>}>
      <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
        <option value="">{t('move.select')}</option>
        {free.map((tb) => <option key={tb.id} value={tb.id}>{tb.label} · {t('common.seats', { n: tb.seats })} · {t(`tableStatus.${tb.status}`)}</option>)}
      </Select>
    </Modal>
  );
}
