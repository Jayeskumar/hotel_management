import { describe, expect, it } from 'vitest';
import { applyBps, computeBill, computeBillDetail, financialYear, splitGst } from './billing.js';
import { can, assignableRoles } from './permissions.js';
import { formatMessage, MESSAGES } from './messages.js';

describe('computeBill', () => {
  it('adds 5% GST on top of menu prices', () => {
    const t = computeBill({
      lines: [
        { unitPriceCents: 6000, quantity: 2, taxRateBps: 500 },              // 2 x ₹60 idli
        { unitPriceCents: 12000, quantity: 1, taxRateBps: 500, modifiersCents: 2000 }, // dosa + ghee
      ],
      serviceChargeBps: 0,
    });
    expect(t.subtotalCents).toBe(26000);
    expect(t.taxCents).toBe(1300);
    expect(t.totalCents).toBe(27300);
  });

  it('rounds the payable amount to the nearest rupee', () => {
    const t = computeBill({ lines: [{ unitPriceCents: 4500, quantity: 1, taxRateBps: 500 }], serviceChargeBps: 0, roundOff: true });
    // 45 + 2.25 = 47.25 -> 47.00
    expect(t.taxCents).toBe(225);
    expect(t.roundOffCents).toBe(-25);
    expect(t.totalCents).toBe(4700);
    const up = computeBill({ lines: [{ unitPriceCents: 5500, quantity: 1, taxRateBps: 500 }], serviceChargeBps: 0, roundOff: true });
    // 55 + 2.75 = 57.75 -> 58.00
    expect(up.roundOffCents).toBe(25);
    expect(up.totalCents).toBe(5800);
  });

  it('applies discount before GST and service charge', () => {
    const t = computeBill({
      lines: [{ unitPriceCents: 10000, quantity: 1, taxRateBps: 500 }],
      discount: { type: 'PERCENT', bps: 1000 },
      serviceChargeBps: 1000,
    });
    expect(t.discountCents).toBe(1000);
    expect(t.serviceChargeCents).toBe(900);
    expect(t.taxCents).toBe(495); // 5% of (9000 + 900)
    expect(t.totalCents).toBe(9000 + 900 + 495);
  });

  it('never discounts beyond the subtotal', () => {
    const t = computeBill({ lines: [{ unitPriceCents: 500, quantity: 1, taxRateBps: 0 }], discount: { type: 'FLAT', amountCents: 9999 }, serviceChargeBps: 0 });
    expect(t.discountCents).toBe(500);
    expect(t.totalCents).toBe(0);
  });

  it('breaks tax down by GST rate, summing exactly', () => {
    const d = computeBillDetail({
      lines: [
        { unitPriceCents: 1001, quantity: 1, taxRateBps: 500 },
        { unitPriceCents: 1001, quantity: 1, taxRateBps: 1800 },
      ],
      serviceChargeBps: 0,
    });
    expect(d.taxBreakdown.map((b) => b.rateBps)).toEqual([500, 1800]);
    expect(d.taxBreakdown.reduce((a, b) => a + b.taxCents, 0)).toBe(d.taxCents);
    expect(d.taxCents).toBe(230);
  });

  it('splits GST into CGST and SGST', () => {
    expect(splitGst(1300)).toEqual({ cgstCents: 650, sgstCents: 650 });
    expect(splitGst(225)).toEqual({ cgstCents: 112, sgstCents: 113 });
  });

  it('computes the Indian financial year', () => {
    expect(financialYear(new Date('2026-03-31T12:00:00Z'))).toBe('2526');
    expect(financialYear(new Date('2026-04-01T00:00:00+05:30'))).toBe('2627');
  });

  it('returns zeros for an empty order', () => {
    expect(computeBill({ lines: [], serviceChargeBps: 1000, roundOff: true }).totalCents).toBe(0);
  });

  it('rounds half up', () => {
    expect(applyBps(25, 1000)).toBe(3);
  });
});

describe('permissions', () => {
  it('restricts roles', () => {
    expect(can('OWNER', 'outlet:manage')).toBe(true);
    expect(can('MANAGER', 'outlet:manage')).toBe(false);
    expect(can('WAITER', 'payments:refund')).toBe(false);
    expect(can('CHEF', 'kitchen:update')).toBe(true);
    expect(assignableRoles('MANAGER')).not.toContain('OWNER');
    expect(assignableRoles('WAITER')).toEqual([]);
  });
});

describe('messages', () => {
  it('has a Tamil translation for every key and translates entity params', () => {
    for (const k of Object.keys(MESSAGES.en)) expect(MESSAGES.ta[k as keyof typeof MESSAGES.en]).toBeTruthy();
    expect(formatMessage('en', 'error.notFound', { entity: 'entity.table' })).toBe('Table not found');
    expect(formatMessage('ta', 'error.notFound', { entity: 'entity.table' })).toBe('மேசை கிடைக்கவில்லை');
    expect(formatMessage('ta', 'table.tooSmall', { table: 'T1', seats: 2 })).toContain('T1');
  });
});
