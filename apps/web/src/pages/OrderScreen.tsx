import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { clsx } from 'clsx';
import {
  ArrowLeft, Ban, CheckCheck, Leaf, Minus, Percent, Plus, Printer, Search, Send, Trash2, Undo2, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { PAYMENT_METHODS, type PaymentMethod } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { dateTime, elapsed, fromCents, money, time, titleCase, toCents } from '../lib/format';
import type { Category, DiningTable, MenuItem, OrderDetail, OrderItem } from '../lib/types';
import {
  Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageLoader, Select, Tabs, Textarea,
} from '../components/ui';
import { ItemStatusBadge, OrderStatusBadge } from '../components/status';

export default function OrderScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const cur = outlet.currency;

  const orderQ = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.get<OrderDetail>(`${base}/orders/${orderId}`),
  });
  const menuQ = useQuery({
    queryKey: ['menu', outlet.id],
    queryFn: () => api.get<{ categories: Category[]; items: MenuItem[] }>(`${base}/menu`),
  });

  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [modItem, setModItem] = useState<MenuItem | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [voidItem, setVoidItem] = useState<OrderItem | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);

  const setOrder = (o: OrderDetail) => {
    qc.setQueryData(['order', orderId], o);
    qc.invalidateQueries({ queryKey: ['floor'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };
  const mut = <V,>(fn: (v: V) => Promise<OrderDetail>, success?: string) => ({
    mutationFn: fn,
    onSuccess: (o: OrderDetail) => { setOrder(o); if (success) toast.success(success); },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });

  const addItem = useMutation(mut((v: { menuItemId: string; quantity: number; modifiers: string[]; notes?: string }) =>
    api.post<OrderDetail>(`${base}/orders/${orderId}/items`, { items: [v] })));
  const setQty = useMutation(mut((v: { itemId: string; quantity: number }) =>
    api.patch<OrderDetail>(`${base}/orders/${orderId}/items/${v.itemId}`, { quantity: v.quantity })));
  const removeItem = useMutation(mut((v: { itemId: string; reason?: string }) =>
    api.post<OrderDetail>(`${base}/orders/${orderId}/items/${v.itemId}/void`, { reason: v.reason })));
  const fire = useMutation(mut(() => api.post<OrderDetail>(`${base}/orders/${orderId}/fire`), 'Sent to kitchen'));
  const serve = useMutation(mut((itemId: string) => api.post<OrderDetail>(`${base}/orders/${orderId}/items/${itemId}/serve`)));
  const cancel = useMutation(mut((reason: string) => api.post<OrderDetail>(`${base}/orders/${orderId}/cancel`, { reason }), 'Order cancelled'));
  const refund = useMutation(mut((v: { paymentId: string; reason: string }) =>
    api.post<OrderDetail>(`${base}/orders/${orderId}/payments/${v.paymentId}/refund`, { reason: v.reason }), 'Payment refunded'));

  const visibleItems = useMemo(() => {
    const items = menuQ.data?.items ?? [];
    const activeCats = new Set(menuQ.data?.categories.filter((c) => c.isActive).map((c) => c.id));
    const q = search.trim().toLowerCase();
    return items.filter((i) => activeCats.has(i.categoryId) && (cat === 'all' || i.categoryId === cat)
      && (!q || i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q)));
  }, [menuQ.data, cat, search]);

  if (orderQ.isLoading || menuQ.isLoading) return <PageLoader />;
  if (orderQ.error || !orderQ.data) return <EmptyState title="Order not found" action={<Button onClick={() => nav('/floor')}>Back to floor</Button>} />;
  const order = orderQ.data;
  const open = order.status === 'OPEN';
  const pending = order.items.filter((i) => i.status === 'PENDING');
  const live = order.items.filter((i) => i.status !== 'VOIDED');
  const canEdit = open && can('orders:update');

  const onPick = (item: MenuItem) => {
    if (!canEdit) return;
    if (!item.isAvailable) return toast.error(`${item.name} is unavailable`);
    if (item.modifiers.length) setModItem(item);
    else addItem.mutate({ menuItemId: item.id, quantity: 1, modifiers: [] });
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Menu */}
      <section className={clsx('flex min-h-0 flex-1 flex-col border-slate-200 lg:border-r', !canEdit && 'hidden lg:flex')}>
        <div className="space-y-3 border-b border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <Link to={order.type === 'DINE_IN' ? '/floor' : '/orders'} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search menu or SKU…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <Tabs value={cat} onChange={setCat} tabs={[{ value: 'all', label: 'All' },
            ...(menuQ.data?.categories ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!canEdit && open && <p className="mb-3 text-sm text-slate-500">You can view this order but not modify it.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <button key={item.id} onClick={() => onPick(item)} disabled={!canEdit || addItem.isPending}
                className={clsx('flex min-h-24 flex-col justify-between rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-500 disabled:cursor-not-allowed',
                  !item.isAvailable && 'opacity-50')}>
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-medium leading-snug text-slate-900">{item.name}</span>
                  {item.isVeg && <Leaf className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Vegetarian" />}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="tabular text-sm font-semibold text-brand-800">{money(item.priceCents, cur)}</span>
                  {!item.isAvailable ? <Badge tone="red">86'd</Badge> : item.modifiers.length > 0 && <span className="text-[10px] uppercase text-slate-400">options</span>}
                </div>
              </button>
            ))}
          </div>
          {visibleItems.length === 0 && <EmptyState title="No menu items" description="Nothing matches your search." />}
        </div>
      </section>

      {/* Ticket */}
      <aside className="flex min-h-0 w-full flex-col bg-white lg:w-[420px] xl:w-[460px]">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">
                Order #{order.orderNumber}
                <span className="ml-2 text-sm font-normal text-slate-500">{order.table ? `Table ${order.table.label}` : titleCase(order.type)}</span>
              </h1>
              <p className="text-xs text-slate-500">
                Opened {time(order.openedAt, outlet.timezone)} · {elapsed(order.openedAt)} ago · {order.guestCount} guest{order.guestCount > 1 ? 's' : ''}
                {order.customerName && ` · ${order.customerName}`}
              </p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          {open && order.type === 'DINE_IN' && can('orders:update') && (
            <button className="mt-2 text-xs font-medium text-brand-700 hover:underline" onClick={() => setShowMove(true)}>Move table</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {order.items.length === 0 ? (
            <EmptyState title="No items yet" description="Tap menu items to add them to this order." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {order.items.map((it) => (
                <li key={it.id} className={clsx('px-4 py-3', it.status === 'VOIDED' && 'bg-slate-50 opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-sm font-medium', it.status === 'VOIDED' && 'line-through')}>
                        <span className="tabular mr-1 text-slate-500">{it.quantity}×</span>{it.name}
                      </p>
                      {it.modifiers.length > 0 && <p className="text-xs text-slate-500">+ {it.modifiers.map((m) => m.name).join(', ')}</p>}
                      {it.notes && <p className="text-xs italic text-amber-700">“{it.notes}”</p>}
                      {it.voidReason && <p className="text-xs text-red-600">Void: {it.voidReason}</p>}
                      <div className="mt-1 flex items-center gap-2"><ItemStatusBadge status={it.status} /></div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="tabular text-sm font-medium">{money((it.unitPriceCents + it.modifiersCents) * it.quantity, cur)}</span>
                      {canEdit && it.status === 'PENDING' && (
                        <div className="flex items-center gap-1">
                          <IconBtn label="Decrease" onClick={() => it.quantity > 1 ? setQty.mutate({ itemId: it.id, quantity: it.quantity - 1 }) : removeItem.mutate({ itemId: it.id })}><Minus className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label="Increase" onClick={() => setQty.mutate({ itemId: it.id, quantity: it.quantity + 1 })}><Plus className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label="Remove" onClick={() => removeItem.mutate({ itemId: it.id })}><Trash2 className="h-3.5 w-3.5 text-red-600" /></IconBtn>
                        </div>
                      )}
                      {open && it.status === 'READY' && can('orders:update') && (
                        <Button size="sm" variant="success" onClick={() => serve.mutate(it.id)}><CheckCheck className="h-3.5 w-3.5" />Served</Button>
                      )}
                      {open && ['QUEUED', 'PREPARING', 'READY', 'SERVED'].includes(it.status) && can('orders:void_item') && (
                        <button className="text-xs text-red-600 hover:underline" onClick={() => setVoidItem(it)}>Void</button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {order.payments.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payments</p>
              <ul className="space-y-1.5">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className={clsx(p.status === 'REFUNDED' && 'line-through text-slate-400')}>
                      {titleCase(p.method)} {p.reference && <span className="text-xs text-slate-400">({p.reference})</span>}
                      {p.tipCents > 0 && <span className="text-xs text-slate-500"> + {money(p.tipCents, cur)} tip</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{money(p.amountCents, cur)}</span>
                      {p.status === 'REFUNDED' ? <Badge tone="red">Refunded</Badge>
                        : can('payments:refund') && <button onClick={() => setRefundId(p.id)} className="text-slate-400 hover:text-red-600" title="Refund" aria-label="Refund"><Undo2 className="h-4 w-4" /></button>}
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
            <Row label="Subtotal" value={money(order.subtotalCents, cur)} />
            {order.discountCents > 0 && <Row label={`Discount${order.discountReason ? ` (${order.discountReason})` : ''}`} value={`−${money(order.discountCents, cur)}`} className="text-emerald-700" />}
            {order.serviceChargeCents > 0 && <Row label={`Service charge (${order.serviceChargeBps / 100}%)`} value={money(order.serviceChargeCents, cur)} />}
            <Row label="Tax" value={money(order.taxCents, cur)} />
            <Row label="Total" value={money(order.totalCents, cur)} className="pt-1 text-base font-semibold text-slate-900" />
            {order.paidCents > 0 && <Row label="Paid" value={money(order.paidCents, cur)} />}
            {open && order.paidCents > 0 && <Row label="Balance due" value={money(order.balanceCents, cur)} className="font-semibold text-brand-800" />}
          </dl>

          {open ? (
            <div className="mt-4 space-y-2">
              {canEdit && (
                <Button className="w-full" size="lg" disabled={!pending.length} loading={fire.isPending} onClick={() => fire.mutate(undefined)}>
                  <Send className="h-4 w-4" />Send to kitchen {pending.length > 0 && `(${pending.reduce((a, i) => a + i.quantity, 0)})`}
                </Button>
              )}
              <div className="grid grid-cols-3 gap-2">
                {can('orders:discount') && <Button variant="secondary" onClick={() => setShowDiscount(true)} disabled={!live.length}><Percent className="h-4 w-4" />Discount</Button>}
                <Button variant="secondary" onClick={() => window.print()} disabled={!live.length}><Printer className="h-4 w-4" />Bill</Button>
                {can('orders:cancel') && <Button variant="secondary" onClick={() => setShowCancel(true)}><Ban className="h-4 w-4" />Cancel</Button>}
              </div>
              {can('payments:create') && (
                <Button variant="success" className="w-full" size="lg" disabled={order.balanceCents <= 0 || pending.length > 0} onClick={() => setShowPay(true)}>
                  <Wallet className="h-4 w-4" />{pending.length > 0 ? 'Send items before payment' : `Take payment · ${money(order.balanceCents, cur)}`}
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-center text-sm text-slate-500">
                {order.status === 'COMPLETED' ? `Closed ${dateTime(order.closedAt, outlet.timezone)}` : `Cancelled: ${order.cancelReason}`}
              </p>
              <Button variant="secondary" className="w-full" onClick={() => window.print()}><Printer className="h-4 w-4" />Print receipt</Button>
            </div>
          )}
        </div>
      </aside>

      <Receipt order={order} />

      {modItem && (
        <ModifierModal item={modItem} currency={cur} onClose={() => setModItem(null)}
          onAdd={(v) => addItem.mutate({ menuItemId: modItem.id, ...v }, { onSuccess: () => setModItem(null) })} loading={addItem.isPending} />
      )}
      {showPay && <PaymentModal order={order} onClose={() => setShowPay(false)} onPaid={(o) => {
        setOrder(o); setShowPay(false);
        if (o.status === 'COMPLETED') { toast.success(`Order #${o.orderNumber} settled`); }
      }} />}
      {showDiscount && <DiscountModal order={order} onClose={() => setShowDiscount(false)} onSaved={(o) => { setOrder(o); setShowDiscount(false); }} />}
      {showMove && <MoveTableModal order={order} onClose={() => setShowMove(false)} onMoved={(o) => { setOrder(o); setShowMove(false); }} />}
      <ConfirmDialog open={showCancel} title="Cancel order" requireReason confirmLabel="Cancel order" loading={cancel.isPending}
        message="All items will be voided and the table released. This is recorded in the audit log."
        onClose={() => setShowCancel(false)} onConfirm={(reason) => cancel.mutate(reason, { onSuccess: () => setShowCancel(false) })} />
      <ConfirmDialog open={!!voidItem} title={`Void ${voidItem?.name ?? ''}`} requireReason confirmLabel="Void item" loading={removeItem.isPending}
        message="This item has already been sent to the kitchen."
        onClose={() => setVoidItem(null)} onConfirm={(reason) => removeItem.mutate({ itemId: voidItem!.id, reason }, { onSuccess: () => setVoidItem(null) })} />
      <ConfirmDialog open={!!refundId} title="Refund payment" requireReason confirmLabel="Refund" loading={refund.isPending}
        onClose={() => setRefundId(null)} onConfirm={(reason) => refund.mutate({ paymentId: refundId!, reason }, { onSuccess: () => setRefundId(null) })} />
    </div>
  );
}

const IconBtn = ({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) => (
  <button onClick={onClick} aria-label={label} className="rounded-md p-1 ring-1 ring-slate-200 hover:bg-slate-100">{children}</button>
);
const Row = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className={clsx('flex justify-between', className)}><dt>{label}</dt><dd className="tabular">{value}</dd></div>
);

function ModifierModal({ item, currency, onClose, onAdd, loading }: {
  item: MenuItem; currency: string; loading: boolean; onClose: () => void;
  onAdd: (v: { quantity: number; modifiers: string[]; notes?: string }) => void;
}) {
  const [mods, setMods] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const unit = item.priceCents + item.modifiers.filter((m) => mods.includes(m.name)).reduce((a, m) => a + m.priceCents, 0);
  return (
    <Modal open onClose={onClose} title={item.name} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={() => onAdd({ quantity: qty, modifiers: mods, notes: notes || undefined })}>Add · {money(unit * qty, currency)}</Button></>}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Options</p>
      <div className="space-y-1">
        {item.modifiers.map((m) => (
          <label key={m.name} className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
            <span className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded text-brand-700" checked={mods.includes(m.name)}
                onChange={(e) => setMods(e.target.checked ? [...mods, m.name] : mods.filter((x) => x !== m.name))} />
              {m.name}
            </span>
            <span className="tabular text-sm text-slate-500">{m.priceCents ? `+${money(m.priceCents, currency)}` : 'Free'}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Field label="Qty"><Input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></Field>
        <Field label="Kitchen note" className="col-span-2"><Input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. medium rare" /></Field>
      </div>
    </Modal>
  );
}

function PaymentModal({ order, onClose, onPaid }: { order: OrderDetail; onClose: () => void; onPaid: (o: OrderDetail) => void }) {
  const { outlet, base } = useOutlet();
  const cur = outlet.currency;
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [amount, setAmount] = useState(fromCents(order.balanceCents));
  const [tip, setTip] = useState('');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  // One idempotency key per payment attempt so double-taps / retries never double-charge.
  const [key] = useState(() => crypto.randomUUID());
  const amountCents = toCents(amount);
  const change = method === 'CASH' && tendered ? toCents(tendered) - amountCents - toCents(tip) : 0;

  const pay = useMutation({
    mutationFn: () => api.post<OrderDetail>(`${base}/orders/${order.id}/payments`, {
      method, amountCents, tipCents: toCents(tip), reference: reference || null, idempotencyKey: key,
    }),
    onSuccess: onPaid,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const split = (n: number) => setAmount(fromCents(Math.ceil(order.balanceCents / n)));

  return (
    <Modal open onClose={onClose} title={`Payment · Balance ${money(order.balanceCents, cur)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="success" loading={pay.isPending} disabled={amountCents <= 0 || amountCents > order.balanceCents || change < 0} onClick={() => pay.mutate()}>
          Charge {money(amountCents + toCents(tip), cur)}
        </Button></>}>
      <div className="grid grid-cols-5 gap-2">
        {PAYMENT_METHODS.map((m) => (
          <button key={m} onClick={() => setMethod(m)}
            className={clsx('rounded-lg px-2 py-3 text-sm font-medium ring-1', method === m ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white ring-slate-300 hover:bg-slate-50')}>
            {titleCase(m)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Amount"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Tip"><Input inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0.00" /></Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="self-center text-xs text-slate-500">Split:</span>
        {[2, 3, 4].map((n) => <Button key={n} size="sm" variant="secondary" onClick={() => split(n)}>1/{n}</Button>)}
        <Button size="sm" variant="secondary" onClick={() => setAmount(fromCents(order.balanceCents))}>Full</Button>
      </div>
      {method === 'CASH' ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Cash tendered"><Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} /></Field>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Change due</p>
            <p className={clsx('tabular text-xl font-semibold', change < 0 ? 'text-red-600' : 'text-slate-900')}>{money(Math.max(0, change), cur)}</p>
          </div>
        </div>
      ) : (
        <Field label="Reference (approval code / txn id)" className="mt-4"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      )}
      {amountCents > order.balanceCents && <p className="mt-3 text-sm text-red-600">Amount exceeds the balance due.</p>}
    </Modal>
  );
}

function DiscountModal({ order, onClose, onSaved }: { order: OrderDetail; onClose: () => void; onSaved: (o: OrderDetail) => void }) {
  const { outlet, base } = useOutlet();
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
    <Modal open onClose={onClose} title="Apply discount" size="sm"
      footer={<>
        {order.discount && <Button variant="ghost" onClick={() => save.mutate(true)}>Remove</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} onClick={() => save.mutate(false)} disabled={!value}>Apply</Button>
      </>}>
      <Tabs value={type} onChange={setType} tabs={[{ value: 'PERCENT', label: 'Percentage' }, { value: 'FLAT', label: `Amount (${outlet.currency})` }]} />
      <div className="mt-4 space-y-3">
        <Field label={type === 'PERCENT' ? 'Percent off' : 'Amount off'}><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Loyalty, service recovery" /></Field>
      </div>
    </Modal>
  );
}

function MoveTableModal({ order, onClose, onMoved }: { order: OrderDetail; onClose: () => void; onMoved: (o: OrderDetail) => void }) {
  const { outlet, base } = useOutlet();
  const { data } = useQuery({ queryKey: ['floor', outlet.id], queryFn: () => api.get<{ tables: DiningTable[] }>(`${base}/floor`) });
  const [tableId, setTableId] = useState('');
  const move = useMutation({
    mutationFn: () => api.patch<OrderDetail>(`${base}/orders/${order.id}`, { tableId }),
    onSuccess: (o) => { toast.success(`Moved to table ${o.table?.label}`); onMoved(o); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const free = (data?.tables ?? []).filter((t) => !t.openOrder && t.status !== 'OUT_OF_SERVICE' && t.id !== order.tableId);
  return (
    <Modal open onClose={onClose} title="Move to another table" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!tableId} loading={move.isPending} onClick={() => move.mutate()}>Move</Button></>}>
      <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
        <option value="">Select a table…</option>
        {free.map((t) => <option key={t.id} value={t.id}>{t.label} · {t.seats} seats · {titleCase(t.status)}</option>)}
      </Select>
    </Modal>
  );
}

function Receipt({ order }: { order: OrderDetail }) {
  const { outlet } = useOutlet();
  const { session } = useAuth();
  const cur = outlet.currency;
  return (
    <div className="print-area font-mono">
      <div style={{ textAlign: 'center' }}>
        <strong style={{ fontSize: 14 }}>{session?.organization?.name}</strong><br />
        {outlet.name}<br />
        {dateTime(order.closedAt ?? new Date().toISOString(), outlet.timezone)}<br />
        Order #{order.orderNumber} · {order.table ? `Table ${order.table.label}` : titleCase(order.type)}
      </div>
      <hr style={{ margin: '6px 0', borderTop: '1px dashed #000' }} />
      {order.items.filter((i) => i.status !== 'VOIDED').map((i) => (
        <div key={i.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{i.quantity} x {i.name}</span><span>{money((i.unitPriceCents + i.modifiersCents) * i.quantity, cur)}</span>
          </div>
          {i.modifiers.length > 0 && <div style={{ paddingLeft: 8 }}>+ {i.modifiers.map((m) => m.name).join(', ')}</div>}
        </div>
      ))}
      <hr style={{ margin: '6px 0', borderTop: '1px dashed #000' }} />
      <RRow l="Subtotal" r={money(order.subtotalCents, cur)} />
      {order.discountCents > 0 && <RRow l="Discount" r={`-${money(order.discountCents, cur)}`} />}
      {order.serviceChargeCents > 0 && <RRow l="Service charge" r={money(order.serviceChargeCents, cur)} />}
      <RRow l="Tax" r={money(order.taxCents, cur)} />
      <RRow l="TOTAL" r={money(order.totalCents, cur)} bold />
      {order.payments.filter((p) => p.status === 'COMPLETED').map((p) => <RRow key={p.id} l={titleCase(p.method)} r={money(p.amountCents, cur)} />)}
      {order.tipCents > 0 && <RRow l="Tip" r={money(order.tipCents, cur)} />}
      {order.balanceCents > 0 && <RRow l="Balance due" r={money(order.balanceCents, cur)} bold />}
      <hr style={{ margin: '6px 0', borderTop: '1px dashed #000' }} />
      <div style={{ textAlign: 'center' }}>Thank you!</div>
    </div>
  );
}
const RRow = ({ l, r, bold }: { l: string; r: string; bold?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}><span>{l}</span><span>{r}</span></div>
);

