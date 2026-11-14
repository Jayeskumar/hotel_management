import { computeBillDetail, splitGst } from '@tablewise/shared';
import { useAuth, useOutlet } from '../lib/auth';
import { useI18n } from '../i18n';
import { dateTime, money } from '../lib/format';
import type { OrderDetail } from '../lib/types';

/**
 * Thermal-printer layouts (80mm). Only the element with `.print-area` is printed.
 * - `invoice`: GST tax invoice (settled orders) or provisional bill (open orders)
 * - `kot`: kitchen order ticket with large quantities and notes, no prices
 */
export type PrintMode = 'invoice' | 'kot';

const hr = <hr style={{ margin: '6px 0', border: 0, borderTop: '1px dashed #000' }} />;
const Row = ({ l, r, bold, big }: { l: React.ReactNode; r: React.ReactNode; bold?: boolean; big?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: bold ? 700 : 400, fontSize: big ? 14 : undefined }}>
    <span>{l}</span><span style={{ whiteSpace: 'nowrap' }}>{r}</span>
  </div>
);

export function PrintArea({ order, mode }: { order: OrderDetail; mode: PrintMode }) {
  return mode === 'kot' ? <Kot order={order} /> : <Invoice order={order} />;
}

function Invoice({ order }: { order: OrderDetail }) {
  const { outlet } = useOutlet();
  const { session } = useAuth();
  const { t, lang } = useI18n();
  const live = order.items.filter((i) => i.status !== 'VOIDED');
  // Per-rate breakdown, recomputed from the snapshot lines with the same shared math as the server.
  const detail = computeBillDetail({
    lines: live.map((i) => ({ unitPriceCents: i.unitPriceCents, quantity: i.quantity, taxRateBps: i.taxRateBps, modifiersCents: i.modifiersCents })),
    discount: order.discount, serviceChargeBps: order.serviceChargeBps, roundOff: outlet.roundOff,
  });
  const final = order.status === 'COMPLETED' && order.invoiceNumber;

  return (
    <div className="print-area">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{outlet.legalName ?? session?.organization?.name}</div>
        <div>{outlet.name}</div>
        {outlet.address && <div>{outlet.address}</div>}
        {outlet.phone && <div>Ph: {outlet.phone}</div>}
        {outlet.gstin && <div>GSTIN: {outlet.gstin}</div>}
        {outlet.fssaiNumber && <div>FSSAI Lic. No: {outlet.fssaiNumber}</div>}
        <div style={{ marginTop: 4, fontWeight: 700 }}>{final ? t('receipt.taxInvoice') : t('receipt.proforma')}</div>
      </div>
      {hr}
      <Row l={`${t('receipt.billNo')}: ${order.invoiceNumber ?? `#${order.orderNumber}`}`} r={order.table ? `${t('receipt.table')}: ${order.table.label}` : t(`orderType.${order.type}`)} />
      <Row l={`${t('receipt.date')}: ${dateTime(order.closedAt ?? new Date().toISOString(), outlet.timezone)}`} r={`#${order.orderNumber}`} />
      {order.customerName && <div>{order.customerName}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</div>}
      {hr}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 36px 56px 64px', columnGap: 4, fontWeight: 700 }}>
        <span>{t('receipt.item')}</span><span style={{ textAlign: 'right' }}>{t('receipt.qty')}</span>
        <span style={{ textAlign: 'right' }}>{t('receipt.rate')}</span><span style={{ textAlign: 'right' }}>{t('receipt.amount')}</span>
      </div>
      {live.map((i) => {
        const unit = i.unitPriceCents + i.modifiersCents;
        return (
          <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1fr 36px 56px 64px', columnGap: 4, marginTop: 2 }}>
            <span>
              {i.name}
              {i.nameTa && <><br /><span style={{ fontSize: 10 }}>{i.nameTa}</span></>}
              {i.modifiers.length > 0 && <><br /><span style={{ fontSize: 10 }}>+ {i.modifiers.map((m) => (lang === 'ta' && m.nameTa) || m.name).join(', ')}</span></>}
            </span>
            <span style={{ textAlign: 'right' }}>{i.quantity}</span>
            <span style={{ textAlign: 'right' }}>{(unit / 100).toFixed(2)}</span>
            <span style={{ textAlign: 'right' }}>{((unit * i.quantity) / 100).toFixed(2)}</span>
          </div>
        );
      })}
      {hr}
      <Row l={t('order.subtotal')} r={money(order.subtotalCents)} />
      {order.discountCents > 0 && <Row l={t('order.discount')} r={`-${money(order.discountCents)}`} />}
      {order.serviceChargeCents > 0 && <Row l={t('order.serviceCharge', { pct: order.serviceChargeBps / 100 })} r={money(order.serviceChargeCents)} />}
      {detail.taxBreakdown.map((b) => {
        const { cgstCents, sgstCents } = splitGst(b.taxCents);
        const half = b.rateBps / 200;
        return (
          <div key={b.rateBps}>
            <Row l={t('order.cgst', { pct: half })} r={money(cgstCents)} />
            <Row l={t('order.sgst', { pct: half })} r={money(sgstCents)} />
          </div>
        );
      })}
      {order.roundOffCents !== 0 && <Row l={t('order.roundOff')} r={`${order.roundOffCents > 0 ? '+' : ''}${(order.roundOffCents / 100).toFixed(2)}`} />}
      {hr}
      <Row l={t('receipt.grandTotal')} r={money(order.totalCents)} bold big />
      {order.payments.filter((p) => p.status === 'COMPLETED').map((p) => (
        <Row key={p.id} l={`${t('receipt.paidBy')}: ${t(`payment.${p.method}`)}`} r={money(p.amountCents)} />
      ))}
      {order.tipCents > 0 && <Row l={t('pay.tip')} r={money(order.tipCents)} />}
      {order.balanceCents > 0 && <Row l={t('order.balance')} r={money(order.balanceCents)} bold />}
      {hr}
      <div style={{ textAlign: 'center', fontSize: 10 }}>{t('receipt.sac')}</div>
      <div style={{ textAlign: 'center', marginTop: 4 }}>{outlet.receiptFooter ?? 'நன்றி! மீண்டும் வருக · Thank you!'}</div>
    </div>
  );
}

function Kot({ order }: { order: OrderDetail }) {
  const { outlet } = useOutlet();
  const { t, dish } = useI18n();
  const items = order.items.filter((i) => ['QUEUED', 'PREPARING'].includes(i.status));
  const list = items.length ? items : order.items.filter((i) => i.status !== 'VOIDED' && i.status !== 'SERVED');
  return (
    <div className="print-area">
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{t('receipt.kot')}</div>
      {hr}
      <div style={{ fontSize: 16, fontWeight: 700 }}>
        #{order.orderNumber} · {order.table ? `${t('receipt.table')} ${order.table.label}` : t(`orderType.${order.type}`)}
      </div>
      <div>{dateTime(new Date().toISOString(), outlet.timezone)}</div>
      {hr}
      {list.map((i) => (
        <div key={i.id} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{i.quantity} × {dish(i)}</div>
          {i.modifiers.length > 0 && <div>+ {i.modifiers.map((m) => m.nameTa ?? m.name).join(', ')}</div>}
          {i.notes && <div style={{ fontWeight: 700 }}>** {i.notes} **</div>}
          <div style={{ fontSize: 10 }}>{t(`station.${i.station}`)}</div>
        </div>
      ))}
      {order.notes && <>{hr}<div style={{ fontWeight: 700 }}>{order.notes}</div></>}
    </div>
  );
}
